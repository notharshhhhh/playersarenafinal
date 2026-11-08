import { db } from '../lib/firebase';
import { collection, query, where, getDocs, onSnapshot, doc } from 'firebase/firestore';
import { PaymentGateway } from '../types';

class PaymentService {
  private activeGateway: PaymentGateway | null = null;
  private unsubscriber: (() => void) | null = null;

  constructor() {
    this.init();
  }

  private init() {
    const q = query(collection(db, 'paymentSettings'), where('isActive', '==', true));
    
    this.unsubscriber = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const data = snapshot.docs[0].data() as PaymentGateway;
        this.activeGateway = { ...data, id: snapshot.docs[0].id };
        console.log(`[PaymentService] Active Gateway: ${this.activeGateway.name}`);
      } else {
        this.activeGateway = null;
        console.warn('[PaymentService] No active payment gateway found');
      }
    });
  }

  public getActiveGateway(): PaymentGateway | null {
    return this.activeGateway;
  }

  public async getActiveGatewayAsync(): Promise<PaymentGateway | null> {
    if (this.activeGateway) return this.activeGateway;
    
    const q = query(collection(db, 'paymentSettings'), where('isActive', '==', true));
    const snap = await getDocs(q);
    
    if (!snap.empty) {
      const data = snap.docs[0].data() as PaymentGateway;
      this.activeGateway = { ...data, id: snap.docs[0].id };
      return this.activeGateway;
    }
    
    return null;
  }

  // Unified payment initiation method
  public async initiateDeposit(amount: number, userId: string) {
    const gateway = await this.getActiveGatewayAsync();
    
    if (!gateway) {
      throw new Error('No active payment gateway configured. Please contact support.');
    }

    // Logic for different gateways
    switch (gateway.id) {
      case 'razorpay':
        return this.initRazorpay(amount, userId, gateway);
      case 'cashfree':
        return this.initCashfree(amount, userId, gateway);
      case 'zapupi':
        return this.initUPIGateway(amount, userId, gateway);
      default:
        return this.initCustomGateway(amount, userId, gateway);
    }
  }

  private async initRazorpay(amount: number, userId: string, config: PaymentGateway) {
    console.log('Initiating Razorpay payment...', { amount, userId, key: config.apiKey });
    // In a real app, you would call your backend to create an order
    // and then open the Razorpay checkout.
    return { type: 'razorpay', amount, config };
  }

  private async initCashfree(amount: number, userId: string, config: PaymentGateway) {
    try {
      console.log('Initiating Cashfree payment...', { amount, userId });
      
      // 1. Create order on backend
      const res = await fetch('/api/cashfree/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, userId })
      });

      if (!res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const error = await res.json();
          throw new Error(error.error || error.message || 'Payment gateway initialization failed');
        } else {
          const text = await res.text();
          console.error('[PaymentService] Non-JSON error response:', text);
          throw new Error(`Server error (${res.status}): ${text.slice(0, 100)}...`);
        }
      }

      const order = await res.json();
      
      // 2. Initialize Checkout
      const cashfree = (window as any).Cashfree({
        mode: config.id === 'cashfree' && (config.apiKey?.includes('TEST') || !config.apiKey) ? 'sandbox' : 'production'
      });

      return cashfree.checkout({
        paymentSessionId: order.payment_session_id,
        redirectTarget: "_self" 
      });
    } catch (error) {
      console.error('Cashfree Error:', error);
      throw error;
    }
  }

  private async initUPIGateway(amount: number, userId: string, config: PaymentGateway) {
    if (config.id === 'zapupi') {
      try {
        console.log('Initiating ZapUPI payment...', { amount, userId });
        
        // 1. Create order on backend
        const res = await fetch('/api/zapupi/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount, userId })
        });

        if (!res.ok) {
          const contentType = res.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const error = await res.json();
            throw new Error(error.error || error.message || 'ZapUPI initialization failed');
          } else {
            const text = await res.text();
            console.error('[PaymentService] ZapUPI non-JSON error response:', text);
            throw new Error(`Server error (${res.status}): ${text.slice(0, 100)}...`);
          }
        }

        const data = await res.json();
        
        // Return data so frontend can choose to poll or redirect
        return { type: 'zapupi', amount, config, ...data };
      } catch (error) {
        console.error('ZapUPI Error:', error);
        throw error;
      }
    }
    
    console.log(`Initiating ${config.name} payment...`, { amount, userId, upi: config.upiId });
    return { type: 'upi', amount, config };
  }

  private async initCustomGateway(amount: number, userId: string, config: PaymentGateway) {
    console.log('Initiating Custom Gateway payment...', { amount, userId });
    return { type: 'custom', amount, config };
  }

  public dispose() {
    if (this.unsubscriber) {
      this.unsubscriber();
    }
  }
}

export const paymentService = new PaymentService();

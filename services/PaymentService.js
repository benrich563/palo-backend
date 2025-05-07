import Payment from '../models/Payment.js';
import https from 'https';

class PaymentService {
  static async initializePayment(data) {
    const {
      type,
      amount,
      email,
      reference,
      metadata,
      callbackUrl
    } = data;

    const params = JSON.stringify({
      email,
      amount: Math.round(amount * 100), // Convert to pesewas
      reference,
      callback_url: callbackUrl,
      metadata
    });

    const options = {
      hostname: 'api.paystack.co',
      port: 443,
      path: '/transaction/initialize',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    };

    return new Promise((resolve, reject) => {
      const paymentReq = https.request(options, paymentRes => {
        let data = '';

        paymentRes.on('data', (chunk) => {
          data += chunk;
        });

        paymentRes.on('end', () => {
          resolve(JSON.parse(data));
        });
      }).on('error', reject);

      paymentReq.write(params);
      paymentReq.end();
    });
  }

  static async verifyPayment(reference) {
    const options = {
      hostname: 'api.paystack.co',
      port: 443,
      path: `/transaction/verify/${reference}`,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
      }
    };

    return new Promise((resolve, reject) => {
      const verifyReq = https.request(options, verifyRes => {
        let data = '';

        verifyRes.on('data', (chunk) => {
          data += chunk;
        });

        verifyRes.on('end', () => {
          resolve(JSON.parse(data));
        });
      }).on('error', reject);

      verifyReq.end();
    });
  }

  static async createPaymentRecord(paymentData) {
    const payment = new Payment(paymentData);
    return payment.save();
  }

  static async updatePaymentStatus(reference, status, paymentDetails) {
    return Payment.findOneAndUpdate(
      { transactionReference: reference },
      { 
        status,
        paymentDetails,
        ...(status === 'SUCCESS' && { paidAt: new Date() })
      },
      { new: true }
    );
  }

  static async processRefund(paymentId, amount, reason) {
    const payment = await Payment.findById(paymentId);
    if (!payment) {
      throw new Error('Payment not found');
    }
    return payment.initializeRefund(amount, reason);
  }

  static async getPaymentHistory(query, options = {}) {
    const { page = 1, limit = 10, sort = { createdAt: -1 } } = options;

    return Payment.find(query)
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('relatedDocument')
      .lean();
  }
}

export default PaymentService;

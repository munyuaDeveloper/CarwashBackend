# Transaction-Based Wallet System

## Overview

The car wash management system now implements a comprehensive transaction-based wallet system that provides complete auditability, traceability, and data integrity. This system replaces the previous direct balance manipulation approach with a robust transaction ledger.

## Key Features

### 1. Complete Audit Trail
- Every wallet operation creates a transaction record
- All transactions are immutable and timestamped
- Full traceability from booking to wallet balance

### 2. Reversible Operations
- Transactions can be reversed instead of deleted
- Prevents data loss and maintains audit trail
- Supports booking updates and cancellations

### 3. Automatic Balance Recalculation
- Wallet balances are automatically calculated from transaction history
- System automatically recalculates balances on every wallet operation
- Ensures data integrity and eliminates manual balance verification
- System can also manually rebuild any wallet's balance from scratch if needed

### 4. Business Rule Enforcement
- Prevents double reversals of the same booking
- Maintains 40/60 commission structure
- Validates transaction integrity

## Transaction Types

### 1. Earning Transactions (`earning`)
- Created when a booking is completed
- Records 40% commission for attendant
- Tracks 60% company share
- Linked to specific booking

### 2. Reversal Transactions (`reversal`)
- Created when a booking is updated or cancelled
- Reverses the effect of previous earning transactions
- Maintains audit trail of changes
- Prevents double reversals

### 3. Payment Submission Transactions (`payment_submission`)
- Created when attendant submits company share
- Reduces company debt
- Tracks cash flow to company

### 4. Adjustment Transactions (`adjustment`)
- Manual adjustments by administrators
- For correcting errors or special circumstances
- Requires admin privileges

## Business Logic

### Commission Structure
- **Attendant Commission**: Always 40% of booking amount
- **Company Share**: Always 60% of booking amount
- **Company Debt**: Only when attendant collects cash (`attendant_cash`)

### Payment Types and Behavior

#### Attendant Cash (`attendant_cash`)
- Attendant gets 40% commission immediately
- Attendant owes 60% to company (company debt)
- **Wallet Balance**: Negative company share amount (e.g., -150 for 60% of 250)
- Attendant must submit cash to reduce debt

#### Admin Cash (`admin_cash`)
- Attendant gets 40% commission immediately
- No company debt (admin has the money)
- Company wallet gets 60% immediately

#### Admin Till (`admin_till`)
- Attendant gets 40% commission immediately
- No company debt (admin has the money)
- Company wallet gets 60% immediately

## Automatic Balance Recalculation

The system automatically recalculates wallet balances from transaction history in the following scenarios:

### 1. Booking Operations
- **Booking Creation**: Creates earning transaction and recalculates balance
- **Booking Update**: Reverses old transaction, creates new transaction, recalculates balance
- **Booking Deletion**: Creates reversal transaction and recalculates balance

### 2. Wallet Access Operations
- **Get My Wallet**: Recalculates balance before returning wallet data
- **Get Attendant Wallet**: Recalculates balance for specific attendant
- **Get All Wallets**: Recalculates balance for all wallets in the list
- **Get Unpaid Wallets**: Recalculates balance for unpaid wallets
- **Get Debt Summary**: Recalculates balance for wallets with company debt

### 3. Payment Operations
- **Payment Submission**: Creates payment transaction and recalculates balance
- **Mark as Paid**: Resets wallet and recalculates balance

### 4. Admin Operations
- **Wallet Summary**: Recalculates balance for all wallets
- **Debt Reports**: Recalculates balance for debt-related queries

## Transaction Flow

### 1. Booking Creation
```
Booking Created → Earning Transaction → Automatic Balance Recalculation
```

### 2. Booking Update
```
Original Transaction Reversed → New Earning Transaction → Automatic Balance Recalculation
```

### 3. Booking Deletion
```
Earning Transaction Reversed → Automatic Balance Recalculation
```

### 4. Payment Submission
```
Payment Submission Transaction → Automatic Balance Recalculation
```

## Wallet Balance Examples

### Attendant Cash Payment (Amount: 1000)
- **Commission**: 400 (40%)
- **Company Share**: 600 (60%)
- **Wallet Balance Change**: -600 (company share as negative)
- **Company Debt**: +600
- **Result**: Attendant owes 600 to company, wallet shows -600

### Attendant Cash Reversal (Amount: 1000)
- **Commission**: -400 (40%)
- **Company Share**: -600 (60%)
- **Wallet Balance Change**: +600 (reverses the company share debt)
- **Company Debt**: -600
- **Result**: Reverses the debt, wallet shows +600

### Admin Cash Payment (Amount: 1000)
- **Commission**: 400 (40%)
- **Company Share**: 600 (60%)
- **Wallet Balance Change**: +400 (no debt)
- **Company Debt**: 0
- **Result**: Attendant gets 400, no debt

## Data Models

### WalletTransaction Schema
```typescript
{
  attendant: ObjectId,        // Reference to User
  booking: ObjectId,         // Reference to Booking
  type: 'earning' | 'reversal' | 'adjustment' | 'payment_submission',
  amount: Number,            // Total booking amount
  commission: Number,        // 40% commission
  companyShare: Number,      // 60% company share
  description: String,       // Human-readable description
  paymentType: String,       // Payment method used
  isReversed: Boolean,       // Whether this transaction was reversed
  reversedBy: ObjectId,      // Who reversed it (if applicable)
  reversedAt: Date,          // When it was reversed (if applicable)
  reversalReason: String     // Why it was reversed (if applicable)
}
```

### Wallet Schema (Updated)
```typescript
{
  attendant: ObjectId,       // Reference to User
  balance: Number,          // Current balance (calculated from transactions)
  totalEarnings: Number,    // Total earnings (calculated from transactions)
  totalCommission: Number,   // Total commission (calculated from transactions)
  totalCompanyShare: Number, // Total company share (calculated from transactions)
  companyDebt: Number,       // Current company debt (calculated from transactions)
  isPaid: Boolean,          // Whether attendant has been marked as paid
  lastPaymentDate: Date     // Last payment date
}
```

## API Endpoints

### Transaction Management
- `GET /api/v1/wallets/my-wallet/transactions` - Get my transactions
- `GET /api/v1/wallets/:attendantId/transactions` - Get attendant's transactions (admin)
- `GET /api/v1/wallets/transactions/booking/:bookingId` - Get booking transactions (admin)

### Wallet Management
- `PATCH /api/v1/wallets/:attendantId/rebuild` - Rebuild wallet balance (admin)
- `GET /api/v1/wallets/my-wallet` - Get my wallet
- `POST /api/v1/wallets/debit` - Submit company share

## Business Rules

### 1. Single Reversal Rule
- A booking can only be reversed once
- System prevents multiple reversals of the same booking
- Maintains data integrity

### 2. Balance Integrity Rule
- Wallet balance always equals sum of non-reversed transactions
- System can rebuild balance from transaction history
- Ensures data consistency

### 3. Transaction Immutability Rule
- Once created, transactions cannot be modified
- Only reversals are allowed
- Maintains audit trail

### 4. Commission Structure Rule
- Attendant always gets 40% commission
- Company always gets 60% share
- Structure is enforced at transaction level

## Benefits

### 1. Complete Auditability
- Every operation is recorded and traceable
- Full history of all wallet changes
- Compliance with financial regulations

### 2. Data Integrity
- Balances can be rebuilt from transaction history
- No data loss even after system issues
- Consistent state across all operations
- SystemWallet validation handles negative values properly during reversals

### 3. Flexibility
- Easy to implement new transaction types
- Simple to add new business rules
- Scalable architecture
- Robust reversal system prevents validation errors

### 4. Transparency
- Clear audit trail for all operations
- Easy to debug issues
- Simple to understand system behavior
- SystemWallet values are protected from going below zero

## Implementation Details

### Balance Calculation
```typescript
// Calculate wallet balance from transactions
const calculateBalance = (transactions) => {
  let balance = 0;
  let totalEarnings = 0;
  let totalCommission = 0;
  let totalCompanyShare = 0;
  let companyDebt = 0;

  transactions.forEach(transaction => {
    if (transaction.type === 'earning' && !transaction.isReversed) {
      balance += transaction.commission;
      totalEarnings += transaction.amount;
      totalCommission += transaction.commission;
      totalCompanyShare += transaction.companyShare;
      
      if (transaction.paymentType === 'attendant_cash') {
        companyDebt += transaction.companyShare;
      }
    } else if (transaction.type === 'reversal' && !transaction.isReversed) {
      balance -= transaction.commission;
      totalEarnings -= transaction.amount;
      totalCommission -= transaction.commission;
      totalCompanyShare -= transaction.companyShare;
      
      if (transaction.paymentType === 'attendant_cash') {
        companyDebt -= transaction.companyShare;
      }
    } else if (transaction.type === 'payment_submission' && !transaction.isReversed) {
      companyDebt -= transaction.amount;
    }
  });

  return { balance, totalEarnings, totalCommission, totalCompanyShare, companyDebt };
};
```

### Transaction Creation
```typescript
// Create earning transaction
const createEarningTransaction = async (attendantId, bookingId, amount, paymentType) => {
  const commission = amount * 0.4;
  const companyShare = amount * 0.6;

  return await WalletTransaction.create({
    attendant: attendantId,
    booking: bookingId,
    type: 'earning',
    amount,
    commission,
    companyShare,
    description: `Earning from booking - ${paymentType}`,
    paymentType
  });
};
```

### Transaction Reversal
```typescript
// Create reversal transaction
const createReversalTransaction = async (attendantId, bookingId, amount, paymentType) => {
  const commission = amount * 0.4;
  const companyShare = amount * 0.6;

  return await WalletTransaction.create({
    attendant: attendantId,
    booking: bookingId,
    type: 'reversal',
    amount,
    commission,
    companyShare,
    description: `Reversal of booking - ${paymentType}`,
    paymentType
  });
};
```

## Migration from Old System

### 1. Data Migration
- Existing wallet balances are preserved
- Transaction history is created for existing balances
- No data loss during migration

### 2. System Updates
- All wallet operations now use transaction model
- Balance calculation is automatic
- Audit trail is maintained

### 3. API Compatibility
- Existing API endpoints continue to work
- New endpoints added for transaction management
- Backward compatibility maintained

## Testing

### 1. Unit Tests
- Test transaction creation
- Test balance calculation
- Test reversal logic

### 2. Integration Tests
- Test complete booking flow
- Test wallet operations
- Test data integrity

### 3. Performance Tests
- Test with large transaction volumes
- Test balance recalculation performance
- Test system scalability

## Monitoring and Maintenance

### 1. Balance Verification
- Regular checks of wallet balance integrity
- Automated balance recalculation
- Alert system for discrepancies

### 2. Transaction Monitoring
- Monitor transaction volumes
- Track system performance
- Identify potential issues

### 3. Data Cleanup
- Archive old transactions
- Optimize database performance
- Maintain system efficiency

## Conclusion

The transaction-based wallet system provides a robust, auditable, and maintainable solution for managing car wash attendant commissions and company finances. The system ensures data integrity, provides complete audit trails, and supports all business requirements while maintaining flexibility for future enhancements.

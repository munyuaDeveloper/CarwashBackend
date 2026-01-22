import cron from 'node-cron';
import Wallet from '../models/walletModel';
import Booking from '../models/bookingModel';
import AppConfig from '../models/appConfigModel';
import mongoose from 'mongoose';

/**
 * Cron job to reset all wallet balances to 0 at midnight (12 AM) every day
 * This automates the balance settlement process if admin forgets to manually settle
 * Only runs if autoResetEnabled is true in the config
 */
const resetWalletBalancesJob = async (): Promise<void> => {
  try {
    // Check if auto reset is enabled
    const config = await AppConfig.getOrCreateConfig();

    if (!config.autoResetEnabled) {
      console.log('⏸️  Auto wallet reset is disabled. Skipping wallet balance reset job.');
      return;
    }

    console.log('🔄 Starting automated wallet balance reset job...');
    const startTime = new Date();

    // Get all wallets that have non-zero balances
    const wallets = await Wallet.find({ balance: { $ne: 0 } });

    if (wallets.length === 0) {
      console.log('✅ No wallets with non-zero balances found. Job completed.');
      return;
    }

    console.log(`📊 Found ${wallets.length} wallet(s) with non-zero balances`);

    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    // Process each wallet
    for (const wallet of wallets) {
      try {
        const attendantId = wallet.attendant.toString();

        // Mark all unpaid completed bookings for this attendant as paid
        const updatedBookings = await Booking.updateMany(
          {
            attendant: attendantId,
            attendantPaid: false,
            status: 'completed'
          },
          { attendantPaid: true }
        );

        // Reset wallet balance to 0
        await wallet.resetWallet();

        successCount++;
        console.log(
          `✅ Reset wallet for attendant ${attendantId}: ${updatedBookings.modifiedCount} booking(s) marked as paid, balance reset to 0`
        );
      } catch (error) {
        errorCount++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorDetails = `Error resetting wallet for attendant ${wallet.attendant}: ${errorMessage}`;
        errors.push(errorDetails);
        console.error(`❌ ${errorDetails}`);
      }
    }

    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    console.log('📈 Wallet Balance Reset Job Summary:');
    console.log(`   ✅ Successfully reset: ${successCount} wallet(s)`);
    console.log(`   ❌ Errors: ${errorCount} wallet(s)`);
    console.log(`   ⏱️  Duration: ${duration}ms`);
    console.log(`   🕐 Completed at: ${endTime.toISOString()}`);

    if (errors.length > 0) {
      console.error('❌ Errors encountered during wallet reset:');
      errors.forEach((error) => console.error(`   - ${error}`));
    }

    // Update config with last reset date
    if (successCount > 0) {
      await AppConfig.updateConfig({
        lastResetDate: endTime,
        lastResetBy: 'System (Cron Job)'
      });
    }
  } catch (error) {
    console.error('💥 Fatal error in wallet balance reset job:', error);
    throw error;
  }
};

/**
 * Initialize and start the cron job scheduler
 * Runs every day at 12:00 AM (midnight)
 * Cron expression: '0 0 * * *' means: minute 0, hour 0, every day of month, every month, every day of week
 */
export const startWalletResetCronJob = (): void => {
  // Check if MongoDB is connected before starting cron job
  if (mongoose.connection.readyState !== 1) {
    console.warn('⚠️  MongoDB not connected. Cron job will start after database connection.');

    // Wait for MongoDB connection
    mongoose.connection.once('connected', () => {
      console.log('✅ MongoDB connected. Starting wallet reset cron job...');
      initializeCronJob();
    });
  } else {
    initializeCronJob();
  }
};

/**
 * Initialize the cron job
 */
const initializeCronJob = (): void => {
  // Schedule job to run every day at 12:00 AM (midnight)
  // Cron expression: '0 0 * * *' = minute 0, hour 0, every day
  const cronExpression = '0 0 * * *';

  // Get timezone from environment variable or default to Africa/Nairobi
  // Common timezones: 'America/New_York', 'Europe/London', 'Africa/Nairobi', etc.
  const timezone = process.env['CRON_TIMEZONE'] || 'Africa/Nairobi';

  const job = cron.schedule(cronExpression, async () => {
    console.log('⏰ Wallet reset cron job triggered at midnight');
    await resetWalletBalancesJob();
  }, {
    timezone
  });

  if (job) {
    console.log('✅ Wallet reset cron job scheduled successfully');
    console.log('   Schedule: Every day at 12:00 AM (midnight)');
    console.log(`   Timezone: ${timezone}`);
    console.log('   Note: Set CRON_TIMEZONE environment variable to change timezone');

    // Log next execution time
    // Note: node-cron doesn't provide a direct way to get next execution time
    // but we can calculate it
    const now = new Date();
    const nextRun = new Date(now);
    nextRun.setUTCHours(0, 0, 0, 0);
    if (nextRun <= now) {
      nextRun.setUTCDate(nextRun.getUTCDate() + 1);
    }
    console.log(`   Next run: ${nextRun.toISOString()}`);
  } else {
    console.error('❌ Failed to schedule wallet reset cron job');
  }
};

/**
 * Manually trigger the wallet reset job (for testing purposes)
 * Can be called via an admin endpoint if needed
 */
export const manualWalletReset = async (): Promise<{
  success: boolean;
  message: string;
  details?: {
    walletsReset: number;
    errors: string[];
  };
}> => {
  try {
    await resetWalletBalancesJob();

    // Get count of wallets that were reset
    const walletsWithZeroBalance = await Wallet.countDocuments({ balance: 0, isPaid: true });

    return {
      success: true,
      message: 'Wallet balances reset successfully',
      details: {
        walletsReset: walletsWithZeroBalance,
        errors: []
      }
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      message: `Failed to reset wallet balances: ${errorMessage}`,
      details: {
        walletsReset: 0,
        errors: [errorMessage]
      }
    };
  }
};

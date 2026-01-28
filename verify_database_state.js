/**
 * DATABASE VERIFICATION SCRIPT
 * 
 * This script helps verify that database updates are working correctly
 * Run this after a user replies to check the state
 */

const { MongoClient } = require('mongodb');
require('dotenv').config({ path: '.env.local' });

async function verifyDatabaseState() {
  const client = new MongoClient(process.env.MONGODB_URI);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB\n');

    const db = client.db();
    
    // Get today's date in IST format (YYYY-MM-DD)
    const getISTDate = () => {
      const now = new Date();
      const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
      const istDate = new Date(now.getTime() + istOffset);
      return istDate.toISOString().split('T')[0];
    };

    const todayIST = getISTDate();
    console.log(`📅 Checking data for: ${todayIST}\n`);

    // Check ReminderExecutions
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 REMINDER EXECUTIONS (Today)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const executions = await db
      .collection('reminderexecutions')
      .find({ date: todayIST })
      .sort({ sentAt: -1 })
      .toArray();

    if (executions.length === 0) {
      console.log('❌ No executions found for today\n');
    } else {
      executions.forEach((exec, index) => {
        console.log(`Execution ${index + 1}:`);
        console.log(`  ID: ${exec._id}`);
        console.log(`  Phone: ${exec.phone}`);
        console.log(`  Status: ${exec.status}`);
        console.log(`  Follow-Up Status: ${exec.followUpStatus}`);
        console.log(`  Sent At: ${exec.sentAt}`);
        console.log(`  Reply Received: ${exec.replyReceivedAt || 'N/A'}`);
        
        // Validation
        if (exec.replyReceivedAt && exec.followUpStatus !== 'cancelled_by_user') {
          console.log(`  ⚠️  WARNING: Reply received but followUpStatus not cancelled!`);
        }
        
        if (exec.status === 'replied' && exec.followUpStatus === 'pending') {
          console.log(`  ⚠️  WARNING: Status is replied but followUp still pending!`);
        }
        
        if (exec.followUpStatus === 'cancelled_by_user') {
          console.log(`  ✅ Correctly marked as cancelled by user`);
        }
        
        console.log('');
      });
    }

    // Check Reminders
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔔 ACTIVE REMINDERS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const reminders = await db
      .collection('reminders')
      .find({ isActive: true })
      .toArray();

    if (reminders.length === 0) {
      console.log('✅ No active reminders (all completed/deactivated)\n');
    } else {
      reminders.forEach((reminder, index) => {
        console.log(`Reminder ${index + 1}:`);
        console.log(`  ID: ${reminder._id}`);
        console.log(`  Phone: ${reminder.phone}`);
        console.log(`  Title: ${reminder.title}`);
        console.log(`  Time: ${reminder.reminderTime}`);
        console.log(`  Follow-Up: ${reminder.followUpTime || 'N/A'}`);
        console.log(`  Is Active: ${reminder.isActive}`);
        console.log(`  Daily Status: ${reminder.dailyStatus}`);
        console.log(`  Last Sent: ${reminder.lastSentAt || 'Never'}`);
        console.log(`  Last Reply: ${reminder.lastRepliedAt || 'Never'}`);
        console.log('');
      });
    }

    // Check for inconsistencies
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 CONSISTENCY CHECK');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    let issuesFound = 0;

    for (const exec of executions) {
      const reminder = await db
        .collection('reminders')
        .findOne({ _id: exec.reminderId });

      if (!reminder) {
        console.log(`⚠️  Execution ${exec._id} has no matching reminder`);
        issuesFound++;
        continue;
      }

      // Check if execution is cancelled but reminder still active
      if (exec.followUpStatus === 'cancelled_by_user' && reminder.isActive) {
        console.log(`❌ ISSUE FOUND:`);
        console.log(`   Execution ${exec._id} is cancelled`);
        console.log(`   But Reminder ${reminder._id} is still ACTIVE`);
        console.log(`   Expected: Reminder should be INACTIVE\n`);
        issuesFound++;
      }

      // Check if execution has reply but status doesn't reflect it
      if (exec.replyReceivedAt && exec.status === 'sent') {
        console.log(`❌ ISSUE FOUND:`);
        console.log(`   Execution ${exec._id} has replyReceivedAt`);
        console.log(`   But status is still 'sent'`);
        console.log(`   Expected: Status should be 'replied' or 'completed'\n`);
        issuesFound++;
      }
    }

    if (issuesFound === 0) {
      console.log('✅ All data is consistent!\n');
    } else {
      console.log(`⚠️  Found ${issuesFound} consistency issue(s)\n`);
    }

    // Recent Message Logs
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📨 RECENT MESSAGE LOGS (Last 10)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const logs = await db
      .collection('messagelogs')
      .find()
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();

    logs.forEach((log, index) => {
      console.log(`${index + 1}. ${log.direction.toUpperCase()} - ${log.messageType}`);
      console.log(`   Phone: ${log.phone}`);
      console.log(`   Content: ${log.content || 'N/A'}`);
      console.log(`   Status: ${log.status}`);
      console.log(`   Time: ${log.createdAt}`);
      console.log('');
    });

    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const totalReminders = await db.collection('reminders').countDocuments();
    const activeReminders = await db.collection('reminders').countDocuments({ isActive: true });
    const todayExecutions = executions.length;
    const cancelledExecutions = executions.filter(e => e.followUpStatus === 'cancelled_by_user').length;
    const pendingExecutions = executions.filter(e => e.followUpStatus === 'pending').length;

    console.log(`Total Reminders: ${totalReminders}`);
    console.log(`Active Reminders: ${activeReminders}`);
    console.log(`Today's Executions: ${todayExecutions}`);
    console.log(`  - Cancelled (replied): ${cancelledExecutions}`);
    console.log(`  - Pending (no reply): ${pendingExecutions}`);
    console.log('');

    if (issuesFound > 0) {
      console.log('⚠️  ACTION REQUIRED: Fix the consistency issues above');
    } else if (pendingExecutions > 0) {
      console.log('ℹ️  Note: Some executions are pending - follow-ups may be sent later');
    } else {
      console.log('✅ Everything looks good!');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the verification
verifyDatabaseState().catch(console.error);

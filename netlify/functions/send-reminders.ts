import type { Config } from "@netlify/functions";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

export default async (req: Request) => {
  const {
    SUPABASE_URL,
    VITE_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    VITE_VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  } = process.env;

  const finalSupabaseUrl = SUPABASE_URL || VITE_SUPABASE_URL;

  if (!finalSupabaseUrl || !SUPABASE_SERVICE_ROLE_KEY || !VITE_VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.error("Missing environment variables for scheduled function");
    return new Response("Missing env vars", { status: 500 });
  }

  // Setup Supabase (Using service role key to bypass RLS and read all cards)
  const supabase = createClient(finalSupabaseUrl, SUPABASE_SERVICE_ROLE_KEY);

  // Setup Web Push
  webpush.setVapidDetails(
    "mailto:hello@example.com",
    VITE_VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );

  try {
    // 1. Find all cards due today or earlier that are NOT done
    const today = new Date().toISOString().split('T')[0];
    
    // We fetch all cards that are not yet done and have a due date
    const { data: cards, error: cardsError } = await supabase
      .from('cards')
      .select('id, owner_id, title, due, description, classification')
      .not('due', 'is', null)
      .lte('due', today);

    if (cardsError) throw cardsError;

    // Filter out cards that are already done
    const activeOverdueCards = cards.filter(card => {
      const isDone = card.classification === 'Done' || (card.description && card.description.includes('"progress":"Done"'));
      return !isDone;
    });

    if (activeOverdueCards.length === 0) {
      return new Response("No tasks due today", { status: 200 });
    }

    // 2. Collect unique users who need notifications
    const userIds = [...new Set(activeOverdueCards.map(c => c.owner_id))];

    // 3. Fetch their push subscriptions
    const { data: subscriptions, error: subsError } = await supabase
      .from('push_subscriptions')
      .select('user_id, subscription')
      .in('user_id', userIds);

    if (subsError) throw subsError;

    let successCount = 0;

    // 4. Send the notifications
    for (const subRecord of subscriptions) {
      // Find how many tasks are due for this specific user
      const userTasksCount = activeOverdueCards.filter(c => c.owner_id === subRecord.user_id).length;
      
      const payload = JSON.stringify({
        title: "Northstar Board",
        body: `Your goals are calling! 🎯 You have ${userTasksCount} task${userTasksCount > 1 ? 's' : ''} due today or overdue. Check your board to keep the momentum going!`,
        icon: "/favicon.png",
      });

      try {
        await webpush.sendNotification(subRecord.subscription, payload);
        successCount++;
      } catch (err: any) {
        // If the subscription is no longer valid (e.g. user revoked permission)
        if (err.statusCode === 404 || err.statusCode === 410) {
          console.log(`Subscription for user ${subRecord.user_id} expired. Cleaning up.`);
          await supabase.from('push_subscriptions').delete().eq('user_id', subRecord.user_id);
        } else {
          console.error("Error sending push to", subRecord.user_id, err);
        }
      }
    }

    console.log(`Successfully sent ${successCount} notifications.`);
    return new Response(`OK - Sent ${successCount}`, { status: 200 });

  } catch (error) {
    console.error("Scheduled function error:", error);
    return new Response("Error executing cron", { status: 500 });
  }
};

// This tells Netlify to run this function every day at 9:00 AM UTC
export const config: Config = {
  schedule: "0 9 * * *",
};

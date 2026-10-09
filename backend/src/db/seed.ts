import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDb } from './connection.js';
import { Chat } from './models/Chat.js';
import { Message, type MessageRole } from './models/Message.js';

interface SeedMessage {
  role: MessageRole;
  content: string;
}

interface SeedChat {
  title: string;
  messages: SeedMessage[];
}

const seedData: SeedChat[] = [
  {
    // Short title
    title: 'Refund',
    messages: [
      {
        role: 'user',
        content: 'Hi, I would like to request a refund for my last invoice #INV-4921.',
      },
      {
        role: 'assistant',
        content:
          'Hello! I can certainly help you with that. To process your refund request for invoice #INV-4921, could you please confirm the reason for the refund and verify the email address associated with your billing account? Once verified, our billing department will review the transaction and issue the refund within 3-5 business days.',
      },
      {
        role: 'user',
        content: 'The account was charged twice during renewal. My billing email is user@example.com.',
      },
    ],
  },
  {
    // Medium title
    title: 'Resetting account password',
    messages: [
      {
        role: 'user',
        content: "I didn't receive the password reset link on my registered email address.",
      },
      {
        role: 'assistant',
        content:
          'I understand how frustrating that can be. Please check your Spam or Junk folder to ensure the verification email was not filtered automatically. Reset emails are sent from no-reply@supportmind.io. If it has been more than 10 minutes, you can trigger another request from the login page, or I can help verify whether your account has an active email delivery block.',
      },
    ],
  },
  {
    // Long title with extensive technical message
    title: 'Integration error when connecting third-party webhooks with OAuth2',
    messages: [
      {
        role: 'user',
        content:
          'We are encountering persistent 401 Unauthorized errors when our production server attempts to deliver webhook payloads through the OAuth2 handshake. The access token is acquired successfully using the client credentials grant, but subsequent POST requests to /api/v1/webhooks/incoming fail with error code "invalid_token".',
      },
      {
        role: 'assistant',
        content:
          'Thank you for reporting this issue in detail. The "invalid_token" error on `/api/v1/webhooks/incoming` despite a successful client credentials handshake typically occurs due to one of three common configuration discrepancies:\n\n1. **Audience Mismatch**: Verify that the token requested includes the exact audience claim (`aud`) expected by the webhook receiver service. If your authorization server issues a default token for the management API instead of the webhook gateway, the signature validation passes but scope verification rejects the request.\n\n2. **Clock Skew & Expiration Buffer**: Ensure your server clock is synchronized via NTP. Tokens issued with strict `nbf` (not before) and `iat` (issued at) timestamps can be rejected if the receiver clock is even a few seconds ahead.\n\n3. **Token Caching & Header Format**: Make sure the token is prefixed properly with `Bearer ` (with a single space) in the `Authorization` header and is not being truncated by intermediate reverse proxies such as Nginx or AWS CloudFront.\n\nCould you inspect the decoded JWT claims using jwt.io or provide the `WWW-Authenticate` header response so we can pinpoint the exact validation failure?',
      },
      {
        role: 'user',
        content:
          'Spot on! The audience claim was indeed pointing to the root management API instead of the webhooks resource server. Updating the `audience` parameter in the token request resolved the issue immediately. Thank you!',
      },
    ],
  },
  {
    // Very long, comprehensive title with long query and explanation
    title: 'Best practices for optimizing PostgreSQL database queries and connection pooling in high-concurrency microservices',
    messages: [
      {
        role: 'user',
        content:
          'Our service experiences significant latency spikes during peak hours when concurrent requests cross 15,000 req/min. We suspect connection pool exhaustion and slow queries on our relational database. What architectural steps and monitoring configurations should we put in place to diagnose bottlenecks and optimize connection reuse across our containerized microservice fleet?',
      },
      {
        role: 'assistant',
        content:
          'Managing high-concurrency database workloads requires a coordinated approach spanning connection management, query optimization, and infrastructure tuning. Here is a battle-tested roadmap:\n\n### 1. Connection Pooling Architecture\n- **Client-Side vs. Proxy Pooling**: Avoid establishing dedicated connections per microservice pod. Use a centralized proxy pooler like **PgBouncer** running in transaction pooling mode. This allows thousands of frontend client sessions to multiplex over a modest pool of 50-100 real PostgreSQL connections.\n- **Sizing Formula**: Calculate pool size using PostgreSQL\'s recommended baseline: `connections = ((core_count * 2) + effective_spindle_count)`. Over-allocating connections causes thread thrashing and memory overhead rather than higher throughput.\n\n### 2. Query Optimization & Indexing\n- Enable `pg_stat_statements` to track queries by total execution time and mean latency.\n- Look out for sequential scans on tables exceeding 50,000 rows. Add composite or partial indexes tailored to your frequent filtering and ordering keys.\n- Beware of N+1 ORM queries—prefer batch loading or CTEs (Common Table Expressions).\n\n### 3. Monitoring & Alerting\n- Track key metrics in Prometheus/Grafana: active vs. idle connections, replication lag, buffer cache hit ratio (should ideally be > 99%), and CPU wait I/O.\n- Set strict timeout thresholds (`statement_timeout = 3000ms`, `idle_in_transaction_session_timeout = 5000ms`) to automatically kill rogue queries before they exhaust worker threads.',
      },
    ],
  },
  {
    // Conversational title
    title: 'How do I configure custom domain SSL certificates in Cloudflare?',
    messages: [
      {
        role: 'user',
        content:
          'I registered a custom domain and pointed the DNS records, but the browser is showing an SSL certificate warning. How should I configure Cloudflare to secure the site with HTTPS?',
      },
      {
        role: 'assistant',
        content:
          'To ensure end-to-end encryption without certificate mismatch warnings, follow these steps in your Cloudflare dashboard:\n\n1. Navigate to **SSL/TLS -> Overview** and set your encryption mode to **Full (strict)** if your origin server has a valid SSL certificate (like Let\'s Encrypt or a Cloudflare Origin CA certificate). If your origin does not yet have an SSL certificate, set it temporarily to **Flexible** (though Full Strict is recommended for security).\n\n2. Under **SSL/TLS -> Edge Certificates**, ensure **Always Use HTTPS** and **Automatic HTTPS Rewrites** are toggled ON.\n\n3. In **DNS Settings**, ensure your domain\'s root (`@`) and `www` CNAME/A records have the orange cloud icon enabled ("Proxied").\n\nIt usually takes between 5 to 15 minutes for the universal edge SSL certificate to finish provisioning worldwide once DNS is proxied.',
      },
    ],
  },
];

const seed = async (): Promise<void> => {
  try {
    console.log('Connecting to MongoDB...');
    await connectDb();

    console.log('Clearing existing chats and messages...');
    await Message.deleteMany({});
    await Chat.deleteMany({});

    console.log('Inserting seed chats and messages...');
    const now = Date.now();

    for (let i = 0; i < seedData.length; i++) {
      const chatItem = seedData[i];
      if (!chatItem) continue;

      // Stagger dates so chats appear chronologically ordered
      const chatTime = new Date(now - (seedData.length - i) * 3600 * 1000);

      const chat = await Chat.create({
        title: chatItem.title,
        createdAt: chatTime,
        updatedAt: chatTime,
      });

      // Insert messages linked to this chat
      let messageTime = chatTime.getTime();
      for (const msg of chatItem.messages) {
        messageTime += 120 * 1000; // 2 minutes later
        await Message.create({
          chatId: chat._id,
          role: msg.role,
          content: msg.content,
          createdAt: new Date(messageTime),
        });
      }

      // Update the chat's updatedAt to the last message timestamp
      await Chat.findByIdAndUpdate(chat._id, {
        updatedAt: new Date(messageTime),
      });

      console.log(`✓ Seeded chat: "${chat.title}" with ${chatItem.messages.length} messages`);
    }

    const chatCount = await Chat.countDocuments();
    const messageCount = await Message.countDocuments();

    console.log(`\n🎉 Seeding completed successfully!`);
    console.log(`Total Chats: ${chatCount}`);
    console.log(`Total Messages: ${messageCount}`);
  } catch (error) {
    console.error('Error while seeding database:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed.');
  }
};

seed();

How to ACTUALLY make your (vibe coded) apps secure (from an actual hacker)

I'm a pentester (ethical hacker) who codes SaaS part-time. I've reviewed hundreds of apps over the years, and honestly? Most have the same holes. Here's what actually keeps you safe.

* **AI code review catches most issues (fr)**

Look, I get it. You're shipping fast. But let Coderabbit review every pull request. It'll catch SQL injection, exposed credentials, broken auth before anything goes live.

Here's a wild one: during a recent pentest, I found a race condition in a client's payment system that was double-charging customers. The dev wrote it late night with AI help. Looked totally fine to them. Would've been an absolute nightmare in production.

* **Rate limiting stops the spam (and saves your wallet)**

I've seen apps get absolutely hammered with 10,000+ fake registrations in minutes. Rate limiting shuts that down real quick.

Without it, you're basically paying for spam. Your database fills with garbage, your email service burns through the monthly quota, and boom: One client ended up with a $500+ AWS bill from a single bot attack. Not fun lol

Start strict: 100 requests/hour per IP. You can always loosen it later if real users complain, but honestly? They won't.

* **Enable RLS from day 0**

Row Level Security means users can only see their own data. Postgres enforces it at the database level, which is exactly where you want it.

Found a dashboard during a pentest once with no RLS. I changed one URL parameter and suddenly I'm looking at everyone's data. That's literally how most data leaks happen - someone forgets this one thing.

Let AI write your RLS policies if you want, but double-check them and actually try to break them yourself.

* **Hide your API keys (seriously)**

API keys in code will get stolen. Not maybe. Will.

During pentests, I find exposed AWS keys, Stripe tokens, database passwords in repos all the time. GitHub bots are scraping for these 24/7: they'll find yours in minutes.

Google Secret Manager or AWS Secrets Manager. That's it. Keys live there, not in your repo. And rotate them every 90 days. Takes like 10 minutes.

* **CAPTCHA stops bots**

I've tested tons of apps with and without CAPTCHA. The difference is honestly massive - we're talking 99% spam reduction.

Without it? You're looking at 200+ garbage submissions daily. "Buy our SEO services" and crypto scams filling up your database. It's annoying as hell.

Use invisible mode so real people never even see it. Bots get challenged. Slap it everywhere: contact forms, registration, login, password reset.

* **HTTPS isn't optional**

Every endpoint needs HTTPS. Redirect HTTP automatically. Zero exceptions here.

I intercept unencrypted traffic during pentests constantly, and you'd be shocked what I see. Session tokens, passwords, API keys - all just sitting there in plain text. It's 2025, people.

Let's Encrypt gives you free certificates. There's literally no excuse.

* **Sanitize every input**

Validate on the frontend. Validate again on the backend. Trust nothing users send you - and I mean nothing.

During pentests, I'm injecting malicious code through forms, URL parameters, file uploads. Most apps fail this test. Don't be most apps.

* **Update your dependencies**

Old packages have known vulnerabilities. When I'm testing security, those are the first things I go after.

Turn on Dependabot or Renovate. Update monthly at minimum. Security patches? Apply them the same day. This one's non-negotiable.

AI makes you fast. But speed without security is just... well, it's just speed toward disaster.

Here's what works: one AI writes your code. Another AI (Coderabbit) audits it. You review the audit. Three layers catching issues before they become problems.

Also, rate limiting protects you when things go right too. Your app goes viral? Traffic spikes 1000x overnight? Limits keep your servers up and your costs reasonable.

From pentesting hundreds of apps: these controls stop 95% of attacks. The other 5% requires skills most hackers don't have, so you're good.

Seriously: I've seen apps lose 40% of users after breaches. $50,000+ incident response bills. Reputations take years to recover.

These controls work. Clients stay. They send referrals.

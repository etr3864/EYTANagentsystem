'use client';

import { useState } from 'react';

export type Lang = 'en' | 'he';

const CONTACT_EMAIL = 'support@0ptive.com';
const CONTACT_PHONE = '+972523006544';
const COMPANY_NUMBER = '517895165';
const DELETION_STATUS_URL = '/data-deletion';

type Block =
  | string
  | { bold: string; rest?: string }
  | { list: string[] }
  | { html: string };

type Section = { title: string; blocks: Block[] };
type Doc = { title: string; lastUpdated: string; sections: Section[]; contact: Section };

// ─── Privacy Policy ─────────────────────────────────────────────────────────
const PRIVACY: Record<Lang, Doc> = {
  en: {
    title: 'Privacy Policy',
    lastUpdated: 'May 2026',
    sections: [
      {
        title: 'Introduction',
        blocks: [
          `Optive Artificial Intelligence Ltd. (Company No. ${COMPANY_NUMBER}) ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard information when you use our AI-powered conversational platform that operates across WhatsApp, Instagram, and Messenger.`,
        ],
      },
      {
        title: 'Information We Collect',
        blocks: [
          { bold: 'Account Information:', rest: 'Email address and name for authentication purposes.' },
          { bold: 'Google Calendar Data:', rest: 'When you connect your Google Calendar, we access:' },
          { list: ['Calendar events (title, date, time, description)', 'Free/busy information', 'Calendar metadata'] },
          { bold: 'WhatsApp Business Platform Data:', rest: 'When you connect a WhatsApp Business account we receive and process: phone numbers (and Business-Scoped User IDs / BSUIDs as Meta migrates to them), display names, profile pictures, message content, message status callbacks, and WhatsApp Business Account metadata.' },
          { bold: 'Instagram & Messenger Data:', rest: 'When you connect an Instagram Business account or Facebook Page we receive and process: Page IDs, Instagram-Scoped User IDs (IGSID) and Page-Scoped User IDs (PSID), display names, profile pictures, direct message content, and messaging metadata.' },
          { bold: 'Usage Data:', rest: 'Logs and analytics required to operate, secure, and improve our services.' },
        ],
      },
      {
        title: 'How We Use Your Information',
        blocks: [
          { list: [
            'To provide and maintain our AI automation services',
            'To schedule and manage appointments via Google Calendar integration',
            'To process and respond to messages on connected channels (WhatsApp, Instagram, Messenger)',
            'To authenticate and secure your account',
            'To improve and optimize our platform',
          ] },
        ],
      },
      {
        title: 'Data Storage and Security',
        blocks: [
          'Your data is stored on secure servers with encryption at rest and in transit. We implement industry-standard security measures including:',
          { list: [
            'SSL/TLS encryption for all data transfers',
            'Secure (Fernet) encryption of all third-party API credentials at rest',
            'Regular security audits and monitoring',
            'Role-based access controls and authentication requirements',
          ] },
          { bold: 'Primary data location:', rest: 'Render hosting infrastructure in Frankfurt, EU.' },
        ],
      },
      {
        title: 'Sub-processors',
        blocks: [
          'We use the following sub-processors to operate the Service. Each is bound by a data processing agreement and complies with applicable privacy laws:',
          { list: [
            'Render (Frankfurt, EU) — application hosting, PostgreSQL, Redis',
            'Cloudflare R2 — encrypted media storage',
            'Anthropic — AI language model processing',
            'OpenAI — AI language model processing and audio transcription',
            'Google — Gemini AI and Google Calendar API',
            'Meta Platforms — WhatsApp Business Platform, Instagram Graph API, Messenger Platform (channel transport)',
            'Wasender — alternative WhatsApp transport for legacy customers',
          ] },
        ],
      },
      {
        title: 'Third-Party Services',
        blocks: [
          'We integrate with the following third-party services:',
          { list: [
            'Google Calendar API — for calendar management and scheduling',
            'WhatsApp Business Platform / Cloud API — for WhatsApp messaging',
            'Meta Instagram Graph API — for Instagram Direct Messages',
            'Meta Messenger Platform — for Facebook Page messaging',
            'AI Services (Anthropic, Google, OpenAI) — for natural language processing',
          ] },
          'We do not sell, trade, or rent your personal information to third parties.',
          'We do not use user data — including data accessed via Google Calendar API or any Meta platform — to train or improve our AI models or any third-party AI models.',
        ],
      },
      {
        title: 'Sharing of Google User Data',
        blocks: [
          'We do not share, transfer, or disclose Google user data to any third party, except as strictly necessary to provide the scheduling functionality described in this policy (e.g., our hosting provider Render, located in Frankfurt, EU).',
          'We do not sell Google user data to any third party under any circumstances.',
          'Google Calendar data is accessed solely for appointment scheduling and availability checks initiated by the business user. No Google user data is used for advertising, marketing, or any purpose unrelated to the core scheduling features of our platform.',
        ],
      },
      {
        title: 'Meta Platform Data Use Restrictions',
        blocks: [
          'We comply with the Meta Platform Terms and the WhatsApp Business Solution Terms for all data received from Meta APIs:',
          { list: [
            'Meta data is used exclusively to deliver the messaging features described in this policy',
            'We do not sell, license, or rent Meta data to any third party',
            'We do not use Meta data for advertising or marketing unrelated to the conversation in which it was received',
            'We do not use Meta data to train AI models or share it with model providers for training',
            'We do not combine Meta data with data from other sources to build advertising profiles',
          ] },
        ],
      },
      {
        title: 'Data Retention',
        blocks: [
          'We retain your data for as long as your account is active or as needed to provide the Service.',
          'Upon a verified deletion request, message content and channel-user records are deleted within 30 days. Operational backups containing the data are purged within an additional 60 days (90 days total).',
          'Google Calendar tokens are stored securely and can be revoked at any time through your Google Account settings.',
          'Logs and aggregated analytics may be retained for up to 12 months for security and abuse prevention.',
        ],
      },
      {
        title: 'Your Rights & Data Deletion Instructions',
        blocks: [
          'You have the right to:',
          { list: [
            'Access your personal data',
            'Request correction of inaccurate data',
            'Request deletion of your data',
            'Revoke Google Calendar access at any time via your Google Account',
            'Export your data',
          ] },
          { bold: 'How to request deletion of your data:', rest: 'Choose any of the following:' },
          { list: [
            `Email ${CONTACT_EMAIL} with the subject "Data Deletion Request" and include the relevant phone number, IGSID, PSID, or business identifier`,
            'For Facebook/Messenger/Instagram users: open your Facebook Settings → Apps and Websites → select "Optive" → "Remove" — this triggers an automated deletion callback',
            `Visit our deletion status page at ${DELETION_STATUS_URL} to track an existing request`,
          ] },
          'We respond to all deletion requests within 30 days. Backups are purged within an additional 60 days.',
        ],
      },
      {
        title: 'Children\'s Privacy',
        blocks: [
          'The Service is not directed to, and is not intended for use by, individuals under 18 years of age. We do not knowingly collect personal information from anyone under 18. If you believe a minor has provided us with personal data, contact us and we will delete it promptly.',
        ],
      },
      {
        title: 'Google API Services User Data Policy',
        blocks: [
          { html: 'Our use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" class="text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements.' },
        ],
      },
      {
        title: 'Changes to this Privacy Policy',
        blocks: [
          'We may update this Privacy Policy from time to time. Material changes will be communicated via the Service or by email. The "Last Updated" date at the top reflects the latest revision.',
        ],
      },
    ],
    contact: {
      title: 'Contact Us',
      blocks: [
        'For questions about this Privacy Policy or to exercise your rights, please contact us:',
        { html: `<ul class="list-none space-y-1 mt-2"><li>📧 Email: <a href="mailto:${CONTACT_EMAIL}" class="text-blue-400 hover:underline">${CONTACT_EMAIL}</a></li><li>📞 Phone: <a href="tel:${CONTACT_PHONE}" class="text-blue-400 hover:underline">${CONTACT_PHONE}</a></li></ul>` },
      ],
    },
  },
  he: {
    title: 'מדיניות פרטיות',
    lastUpdated: 'מאי 2026',
    sections: [
      {
        title: 'מבוא',
        blocks: [
          `אופטיב בינה מלאכותית בע"מ (ח.פ. ${COMPANY_NUMBER}) ("אנחנו", "שלנו") מחויבת להגנה על פרטיותך. מדיניות פרטיות זו מסבירה כיצד אנו אוספים, משתמשים, חושפים ומגנים על מידע בעת השימוש בפלטפורמת ה-AI השיחתית שלנו, הפועלת ב-WhatsApp, Instagram ו-Messenger.`,
        ],
      },
      {
        title: 'מידע שאנו אוספים',
        blocks: [
          { bold: 'פרטי חשבון:', rest: 'כתובת אימייל ושם לצורכי אימות.' },
          { bold: 'מידע מ-Google Calendar:', rest: 'כאשר אתה מחבר את היומן שלך אנו ניגשים ל-:' },
          { list: ['אירועי יומן (כותרת, תאריך, שעה, תיאור)', 'מידע על זמינות (Free/Busy)', 'metadata של היומן'] },
          { bold: 'נתוני WhatsApp Business Platform:', rest: 'בעת חיבור חשבון WhatsApp עסקי אנו מקבלים ומעבדים: מספרי טלפון (ומזהי משתמש מבוססי-עסק / BSUID ככל שמטא עוברת אליהם), שמות תצוגה, תמונות פרופיל, תוכן הודעות, callbacks של סטטוס הודעה, ו-metadata של החשבון העסקי.' },
          { bold: 'נתוני Instagram ו-Messenger:', rest: 'בעת חיבור חשבון Instagram עסקי או דף Facebook אנו מקבלים ומעבדים: Page IDs, מזהי משתמש מבוססי-Instagram (IGSID) ומבוססי-דף (PSID), שמות תצוגה, תמונות פרופיל, תוכן הודעות DM, ו-metadata של ההודעות.' },
          { bold: 'נתוני שימוש:', rest: 'logs ואנליטיקה הנדרשים להפעלה, אבטחה ושיפור השירות.' },
        ],
      },
      {
        title: 'כיצד אנו משתמשים במידע שלך',
        blocks: [
          { list: [
            'להפעלה ותחזוקה של שירותי האוטומציה מבוססי-AI',
            'לתיאום וניהול פגישות באמצעות אינטגרציה עם Google Calendar',
            'לעיבוד ומענה להודעות בערוצים המחוברים (WhatsApp, Instagram, Messenger)',
            'לאימות ואבטחת חשבונך',
            'לשיפור ואופטימיזציה של הפלטפורמה',
          ] },
        ],
      },
      {
        title: 'אחסון נתונים ואבטחה',
        blocks: [
          'הנתונים שלך מאוחסנים בשרתים מאובטחים עם הצפנה במנוחה ובתעבורה. אנו מיישמים אמצעי אבטחה תקניים כולל:',
          { list: [
            'הצפנת SSL/TLS לכל העברות הנתונים',
            'הצפנה מאובטחת (Fernet) של כל ה-API credentials של צד שלישי במנוחה',
            'ביקורות אבטחה ומוניטורינג שוטפים',
            'בקרת גישה מבוססת תפקידים ודרישות אימות',
          ] },
          { bold: 'מיקום נתונים ראשי:', rest: 'תשתית האירוח Render בפרנקפורט, האיחוד האירופי.' },
        ],
      },
      {
        title: 'תת-מעבדים (Sub-processors)',
        blocks: [
          'אנו משתמשים בתת-מעבדים הבאים לתפעול השירות. כל אחד כפוף להסכם עיבוד נתונים ועומד בחוקי הפרטיות החלים:',
          { list: [
            'Render (פרנקפורט, האיחוד האירופי) — אירוח אפליקציה, PostgreSQL, Redis',
            'Cloudflare R2 — אחסון מדיה מוצפן',
            'Anthropic — עיבוד מודלי שפה (AI)',
            'OpenAI — עיבוד מודלי שפה (AI) ותמלול אודיו',
            'Google — Gemini AI ו-Google Calendar API',
            'Meta Platforms — WhatsApp Business Platform, Instagram Graph API, Messenger Platform (תעבורת ערוצים)',
            'Wasender — תעבורת WhatsApp חלופית עבור לקוחות מורשת',
          ] },
        ],
      },
      {
        title: 'שירותי צד שלישי',
        blocks: [
          'אנו משלבים את שירותי הצד השלישי הבאים:',
          { list: [
            'Google Calendar API — לניהול יומן ותיאום',
            'WhatsApp Business Platform / Cloud API — להודעות WhatsApp',
            'Meta Instagram Graph API — להודעות Instagram Direct',
            'Meta Messenger Platform — להודעות בדפי Facebook',
            'שירותי AI (Anthropic, Google, OpenAI) — לעיבוד שפה טבעית',
          ] },
          'אנו לא מוכרים, סוחרים או משכירים את המידע האישי שלך לצדדים שלישיים.',
          'אנו לא משתמשים בנתוני משתמשים — כולל נתונים שהתקבלו מ-Google Calendar API או מכל פלטפורמה של Meta — לאימון או שיפור מודלי AI שלנו או של צד שלישי כלשהו.',
        ],
      },
      {
        title: 'שיתוף נתוני משתמשי Google',
        blocks: [
          'איננו משתפים, מעבירים או חושפים נתוני משתמשי Google לצד שלישי כלשהו, מלבד מקרים הכרחיים בהחלט לאספקת פונקציונליות התיאום המתוארת במדיניות זו (למשל, ספק האירוח שלנו Render, הממוקם בפרנקפורט).',
          'אנו לא מוכרים נתוני משתמשי Google לצד שלישי בשום נסיבות.',
          'גישה לנתוני Google Calendar נעשית אך ורק לתיאום פגישות ובדיקת זמינות שיוזם המשתמש העסקי. שום נתון של Google אינו משמש לפרסום, שיווק או כל מטרה שאינה קשורה לפיצ\'רי התיאום הליבתיים.',
        ],
      },
      {
        title: 'הגבלות שימוש בנתוני Meta Platform',
        blocks: [
          'אנו עומדים ב-Meta Platform Terms וב-WhatsApp Business Solution Terms עבור כל נתון המתקבל מ-Meta APIs:',
          { list: [
            'נתוני Meta משמשים אך ורק לאספקת פיצ\'רי השליחה המתוארים במדיניות זו',
            'אנו לא מוכרים, מרשים או משכירים נתוני Meta לצד שלישי',
            'אנו לא משתמשים בנתוני Meta לפרסום או שיווק שאינם קשורים לשיחה שבה התקבלו',
            'אנו לא משתמשים בנתוני Meta לאימון מודלי AI או משתפים אותם עם ספקי מודלים לצורכי אימון',
            'אנו לא משלבים נתוני Meta עם נתונים ממקורות אחרים לצורך בניית פרופילי פרסום',
          ] },
        ],
      },
      {
        title: 'שמירת נתונים',
        blocks: [
          'אנו שומרים את נתוניך כל עוד חשבונך פעיל או כל עוד הדבר נדרש לאספקת השירות.',
          'בעת בקשת מחיקה מאומתת, תוכן ההודעות ורשומות ערוץ-משתמש נמחקים תוך 30 יום. גיבויי תפעול המכילים את הנתונים נמחקים תוך 60 ימים נוספים (90 יום סך הכול).',
          'Tokens של Google Calendar מאוחסנים מאובטחים וניתן לבטלם בכל עת דרך הגדרות חשבון Google שלך.',
          'Logs ואנליטיקה מצטברים עשויים להישמר עד 12 חודשים לצורכי אבטחה ומניעת abuse.',
        ],
      },
      {
        title: 'הזכויות שלך והוראות מחיקת נתונים',
        blocks: [
          'הזכויות שלך:',
          { list: [
            'גישה לנתוניך האישיים',
            'בקשת תיקון של נתונים שגויים',
            'בקשת מחיקה של נתוניך',
            'ביטול גישה ל-Google Calendar בכל עת דרך חשבון Google שלך',
            'ייצוא נתוניך',
          ] },
          { bold: 'כיצד לבקש מחיקת נתונים:', rest: 'בחר באחת מהדרכים הבאות:' },
          { list: [
            `שלח אימייל ל-${CONTACT_EMAIL} עם הנושא "בקשת מחיקת נתונים" וצרף את מספר הטלפון, IGSID, PSID או מזהה עסק רלוונטי`,
            'משתמשי Facebook/Messenger/Instagram: פתח את הגדרות Facebook → אפליקציות ואתרים → בחר "Optive" → "הסר" — זה מפעיל callback מחיקה אוטומטי',
            `בקר בדף סטטוס המחיקה שלנו בכתובת ${DELETION_STATUS_URL} למעקב אחר בקשה קיימת`,
          ] },
          'אנו עונים לכל בקשות המחיקה תוך 30 יום. גיבויים נמחקים תוך 60 ימים נוספים.',
        ],
      },
      {
        title: 'פרטיות ילדים',
        blocks: [
          'השירות אינו מיועד לשימוש על ידי אנשים מתחת לגיל 18 ואינו מכוון אליהם. אנו לא אוספים ביודעין מידע אישי מאף אחד מתחת לגיל 18. אם נודע לך שקטין מסר לנו נתונים אישיים, אנא צור קשר ונמחק אותם בהקדם.',
        ],
      },
      {
        title: 'Google API Services User Data Policy',
        blocks: [
          { html: 'השימוש שלנו במידע מ-Google APIs וההעברה שלו עומדים ב-<a href="https://developers.google.com/terms/api-services-user-data-policy" class="text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>, כולל דרישות Limited Use.' },
        ],
      },
      {
        title: 'שינויים במדיניות פרטיות זו',
        blocks: [
          'אנו עשויים לעדכן מדיניות זו מעת לעת. שינויים מהותיים יועברו דרך השירות או באימייל. תאריך "עודכן לאחרונה" בראש הדף משקף את הגרסה האחרונה.',
        ],
      },
    ],
    contact: {
      title: 'יצירת קשר',
      blocks: [
        'לשאלות לגבי מדיניות פרטיות זו או למימוש זכויותיך, אנא צור קשר:',
        { html: `<ul class="list-none space-y-1 mt-2"><li>📧 אימייל: <a href="mailto:${CONTACT_EMAIL}" class="text-blue-400 hover:underline">${CONTACT_EMAIL}</a></li><li>📞 טלפון: <a href="tel:${CONTACT_PHONE}" class="text-blue-400 hover:underline">${CONTACT_PHONE}</a></li></ul>` },
      ],
    },
  },
};

// ─── Terms of Service ───────────────────────────────────────────────────────
const TERMS: Record<Lang, Doc> = {
  en: {
    title: 'Terms of Service',
    lastUpdated: 'May 2026',
    sections: [
      {
        title: 'Acceptance of Terms',
        blocks: [
          `By accessing or using the platform operated by Optive Artificial Intelligence Ltd. (Company No. ${COMPANY_NUMBER}) (the "Service"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.`,
        ],
      },
      {
        title: 'Description of Service',
        blocks: [
          'The Service is an AI-powered conversational platform that enables automated messaging across WhatsApp, Instagram, and Messenger, and integrates with Google Calendar for scheduling and appointment management. The Service uses artificial intelligence to process and respond to messages.',
        ],
      },
      {
        title: 'User Accounts',
        blocks: [
          { list: [
            'You must provide accurate and complete information when creating an account',
            'You are responsible for maintaining the security of your account credentials',
            'You must notify us immediately of any unauthorized access',
            'One account per user; account sharing is prohibited',
          ] },
        ],
      },
      {
        title: 'Acceptable Use',
        blocks: [
          'You agree NOT to use the Service to:',
          { list: [
            'Send spam, unsolicited messages, or harassment',
            'Violate any applicable laws or regulations',
            'Infringe on intellectual property rights',
            'Distribute malware or harmful content',
            'Impersonate others or misrepresent your identity',
            'Violate the WhatsApp Business Messaging Policy, the Meta Platform Terms, the Instagram Platform Policy, or the Messenger Platform Policy',
            'Send commercial messages on Meta channels without prior opt-in consent from recipients',
          ] },
        ],
      },
      {
        title: 'Meta Platform Compliance',
        blocks: [
          'When you connect a WhatsApp Business Account, an Instagram Business Account, or a Facebook Page to the Service, you acknowledge that:',
          { list: [
            'You are bound by the Meta Platform Terms and the WhatsApp Business Solution Terms in addition to these Terms',
            'Meta may suspend, restrict, or terminate access to your accounts independently of us',
            'You must obtain and maintain all required user consents under applicable law (including opt-in for marketing messages on WhatsApp)',
            'You are responsible for the content of all messages sent through your connected accounts',
          ] },
        ],
      },
      {
        title: 'Google Calendar Integration',
        blocks: [
          'When you connect your Google Calendar, you authorize us to access and manage calendar events on your behalf. You can revoke this access at any time through your Google Account settings. We comply with Google\'s API Services User Data Policy.',
          'We do not use user data, including data accessed via Google Calendar API, to train or improve our AI models or any third-party AI models.',
        ],
      },
      {
        title: 'AI-Generated Content',
        blocks: [
          'The Service uses AI to generate automated responses. While we strive for accuracy, AI-generated content may contain errors. You are responsible for reviewing and verifying automated messages before they impact critical decisions.',
        ],
      },
      {
        title: 'Intellectual Property',
        blocks: [
          'The Service, including its design, features, and content, is owned by Optive Artificial Intelligence Ltd. and protected by intellectual property laws. You retain ownership of your data and content.',
        ],
      },
      {
        title: 'Data Processor Role',
        blocks: [
          'For data received from end users via your connected channels, you are the Data Controller and we act as Data Processor on your behalf within the meaning of GDPR and equivalent privacy laws. We process such data solely under your instructions and as necessary to operate the Service.',
        ],
      },
      {
        title: 'Service Availability and Third-Party Dependencies',
        blocks: [
          'The Service depends on third-party APIs and platforms (Meta, Google, AI providers, hosting). We do not guarantee uninterrupted availability and are not liable for outages, rate limits, suspensions, webhook delays, or other disruptions originating from these third parties.',
        ],
      },
      {
        title: 'Limitation of Liability',
        blocks: [
          'THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND. WE ARE NOT LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES ARISING FROM YOUR USE OF THE SERVICE.',
        ],
      },
      {
        title: 'Termination',
        blocks: [
          'We reserve the right to suspend or terminate your account for violations of these Terms. Upon termination, your right to use the Service ceases immediately. You may also delete your account at any time.',
        ],
      },
      {
        title: 'Changes to Terms',
        blocks: [
          'We may update these Terms from time to time. Continued use of the Service after changes constitutes acceptance of the new Terms.',
        ],
      },
      {
        title: 'Governing Law',
        blocks: [
          'These Terms are governed by the laws of the State of Israel. Any disputes shall be resolved in the competent courts of Israel.',
        ],
      },
    ],
    contact: {
      title: 'Contact',
      blocks: [
        'For questions about these Terms, please contact us:',
        { html: `<ul class="list-none space-y-1 mt-2"><li>📧 Email: <a href="mailto:${CONTACT_EMAIL}" class="text-blue-400 hover:underline">${CONTACT_EMAIL}</a></li><li>📞 Phone: <a href="tel:${CONTACT_PHONE}" class="text-blue-400 hover:underline">${CONTACT_PHONE}</a></li></ul>` },
      ],
    },
  },
  he: {
    title: 'תנאי שימוש',
    lastUpdated: 'מאי 2026',
    sections: [
      {
        title: 'קבלת התנאים',
        blocks: [
          `על ידי גישה או שימוש בפלטפורמה המופעלת על ידי אופטיב בינה מלאכותית בע"מ (ח.פ. ${COMPANY_NUMBER}) ("השירות"), אתה מסכים להיות כפוף לתנאי שימוש אלה. אם אינך מסכים, אנא הימנע משימוש בשירות.`,
        ],
      },
      {
        title: 'תיאור השירות',
        blocks: [
          'השירות הוא פלטפורמה שיחתית מבוססת AI המאפשרת תקשורת אוטומטית ב-WhatsApp, Instagram ו-Messenger, ומשתלבת עם Google Calendar לניהול ותיאום פגישות. השירות משתמש בבינה מלאכותית לעיבוד ומענה להודעות.',
        ],
      },
      {
        title: 'חשבונות משתמש',
        blocks: [
          { list: [
            'עליך לספק מידע מדויק ומלא בעת יצירת חשבון',
            'אתה אחראי לשמירה על אבטחת פרטי החשבון שלך',
            'עליך להודיע לנו מיד על כל גישה לא מורשית',
            'חשבון אחד למשתמש; שיתוף חשבונות אסור',
          ] },
        ],
      },
      {
        title: 'שימוש מותר',
        blocks: [
          'אתה מסכים לא להשתמש בשירות לשם:',
          { list: [
            'שליחת ספאם, הודעות לא רצויות או הטרדה',
            'הפרת חוקים או תקנות החלים',
            'הפרת זכויות קניין רוחני',
            'הפצת תוכנות זדוניות או תוכן מזיק',
            'התחזות לאחרים או הצגה כוזבת של זהותך',
            'הפרת WhatsApp Business Messaging Policy, Meta Platform Terms, Instagram Platform Policy או Messenger Platform Policy',
            'שליחת הודעות מסחריות בערוצי Meta ללא הסכמת opt-in מוקדמת של הנמענים',
          ] },
        ],
      },
      {
        title: 'עמידה ב-Meta Platform',
        blocks: [
          'בעת חיבור חשבון WhatsApp Business, חשבון Instagram עסקי או דף Facebook לשירות, אתה מאשר כי:',
          { list: [
            'אתה כפוף ל-Meta Platform Terms ול-WhatsApp Business Solution Terms בנוסף לתנאים אלה',
            'Meta רשאית להשעות, להגביל או לסיים את הגישה לחשבונותיך באופן עצמאי',
            'עליך להשיג ולשמר את כל הסכמות המשתמש הנדרשות על פי החוק החל (כולל opt-in להודעות שיווק ב-WhatsApp)',
            'אתה אחראי לתוכן כל ההודעות הנשלחות דרך חשבונותיך המחוברים',
          ] },
        ],
      },
      {
        title: 'אינטגרציה עם Google Calendar',
        blocks: [
          'בעת חיבור Google Calendar, אתה מאשר לנו לגשת ולנהל אירועי יומן בשמך. ניתן לבטל גישה זו בכל עת דרך הגדרות חשבון Google שלך. אנו עומדים ב-Google API Services User Data Policy.',
          'אנו לא משתמשים בנתוני משתמשים, כולל נתונים מ-Google Calendar API, לאימון או שיפור מודלי AI שלנו או של צד שלישי כלשהו.',
        ],
      },
      {
        title: 'תוכן שנוצר על ידי AI',
        blocks: [
          'השירות משתמש ב-AI ליצירת תגובות אוטומטיות. למרות שאנו שואפים לדיוק, תוכן שנוצר על ידי AI עלול להכיל שגיאות. אתה אחראי לבדיקה ואימות של הודעות אוטומטיות לפני שהן משפיעות על החלטות קריטיות.',
        ],
      },
      {
        title: 'קניין רוחני',
        blocks: [
          'השירות, כולל העיצוב, הפיצ\'רים והתוכן שלו, בבעלות אופטיב בינה מלאכותית בע"מ ומוגן על ידי חוקי קניין רוחני. אתה שומר על בעלות בנתוניך ובתכניך.',
        ],
      },
      {
        title: 'תפקיד מעבד נתונים (Data Processor)',
        blocks: [
          'לגבי נתונים המתקבלים ממשתמשי הקצה דרך הערוצים המחוברים שלך, אתה הבקר (Data Controller) ואנחנו פועלים כמעבד (Data Processor) בשמך, במשמעות GDPR וחוקי פרטיות מקבילים. אנו מעבדים נתונים אלה אך ורק לפי הוראותיך וככל שדרוש להפעלת השירות.',
        ],
      },
      {
        title: 'זמינות השירות ותלות בצדדים שלישיים',
        blocks: [
          'השירות תלוי ב-APIs ופלטפורמות צד שלישי (Meta, Google, ספקי AI, אירוח). איננו מבטיחים זמינות בלתי-פוסקת ואיננו אחראים להפסקות, rate limits, השעיות, עיכובי webhooks או הפרעות אחרות הנובעות מצדדים שלישיים אלה.',
        ],
      },
      {
        title: 'הגבלת אחריות',
        blocks: [
          'השירות מסופק "כמות שהוא" ללא אחריות מכל סוג. איננו אחראים לכל נזק עקיף, מקרי, מיוחד או תוצאתי הנובע משימושך בשירות.',
        ],
      },
      {
        title: 'סיום',
        blocks: [
          'אנו שומרים על הזכות להשעות או לסיים את חשבונך בגין הפרת תנאים אלה. עם הסיום, זכותך להשתמש בשירות נפסקת מיד. ניתן גם למחוק את חשבונך בכל עת.',
        ],
      },
      {
        title: 'שינויים בתנאים',
        blocks: [
          'אנו עשויים לעדכן תנאים אלה מעת לעת. המשך שימוש בשירות לאחר שינויים מהווה הסכמה לתנאים החדשים.',
        ],
      },
      {
        title: 'דין חל',
        blocks: [
          'תנאים אלה כפופים לדיני מדינת ישראל. כל סכסוך יוכרע בבתי המשפט המוסמכים בישראל.',
        ],
      },
    ],
    contact: {
      title: 'יצירת קשר',
      blocks: [
        'לשאלות לגבי תנאים אלה, אנא צור קשר:',
        { html: `<ul class="list-none space-y-1 mt-2"><li>📧 אימייל: <a href="mailto:${CONTACT_EMAIL}" class="text-blue-400 hover:underline">${CONTACT_EMAIL}</a></li><li>📞 טלפון: <a href="tel:${CONTACT_PHONE}" class="text-blue-400 hover:underline">${CONTACT_PHONE}</a></li></ul>` },
      ],
    },
  },
};

// ─── Renderer ───────────────────────────────────────────────────────────────
function BlockView({ block }: { block: Block }) {
  if (typeof block === 'string') return <p>{block}</p>;
  if ('html' in block) return <div dangerouslySetInnerHTML={{ __html: block.html }} />;
  if ('list' in block) {
    return (
      <ul className="list-disc list-inside ml-4 space-y-1">
        {block.list.map((item, i) => <li key={i}>{item}</li>)}
      </ul>
    );
  }
  return (
    <p>
      <strong>{block.bold}</strong>
      {block.rest ? ` ${block.rest}` : null}
    </p>
  );
}

function DocBody({ doc, lang }: { doc: Doc; lang: Lang }) {
  const dir = lang === 'he' ? 'rtl' : 'ltr';
  const align = lang === 'he' ? 'text-right' : 'text-left';
  const labelLastUpdated = lang === 'he' ? 'עודכן לאחרונה:' : 'Last Updated:';
  return (
    <div dir={dir} className={`space-y-4 ${align}`}>
      <p><strong>{labelLastUpdated}</strong> {doc.lastUpdated}</p>
      {doc.sections.map((s, i) => (
        <section key={i} className="space-y-2">
          <h3 className="text-white font-semibold">{i + 1}. {s.title}</h3>
          {s.blocks.map((b, j) => <BlockView key={j} block={b} />)}
        </section>
      ))}
      <section className="space-y-2 pt-2">
        <h3 className="text-white font-semibold">{doc.sections.length + 1}. {doc.contact.title}</h3>
        {doc.contact.blocks.map((b, j) => <BlockView key={j} block={b} />)}
      </section>
    </div>
  );
}

// ─── Public components ─────────────────────────────────────────────────────
export function PrivacyContent({ lang = 'en' }: { lang?: Lang }) {
  return <DocBody doc={PRIVACY[lang]} lang={lang} />;
}

export function TermsContent({ lang = 'en' }: { lang?: Lang }) {
  return <DocBody doc={TERMS[lang]} lang={lang} />;
}

export function getPrivacyTitle(lang: Lang) { return PRIVACY[lang].title; }
export function getTermsTitle(lang: Lang) { return TERMS[lang].title; }

type ModalType = 'privacy' | 'terms' | null;

export function LegalFooter({ className = '' }: { className?: string }) {
  const [openModal, setOpenModal] = useState<ModalType>(null);
  const [lang, setLang] = useState<Lang>('en');

  return (
    <>
      <div className={`text-center text-xs text-gray-600 space-x-3 rtl:space-x-reverse ${className}`}>
        <button onClick={() => setOpenModal('terms')} className="hover:text-gray-400 transition underline">
          Terms of Service
        </button>
        <span>•</span>
        <button onClick={() => setOpenModal('privacy')} className="hover:text-gray-400 transition underline">
          Privacy Policy
        </button>
      </div>

      {openModal && (
        <LegalModal
          type={openModal}
          lang={lang}
          onLangChange={setLang}
          onClose={() => setOpenModal(null)}
        />
      )}
    </>
  );
}

export function LegalModal({
  type,
  lang,
  onLangChange,
  onClose,
}: {
  type: 'privacy' | 'terms';
  lang: Lang;
  onLangChange: (l: Lang) => void;
  onClose: () => void;
}) {
  const title = type === 'privacy' ? getPrivacyTitle(lang) : getTermsTitle(lang);
  const closeLabel = lang === 'he' ? 'סגור' : 'Close';
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-4 border-b border-gray-700 gap-3">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onLangChange(lang === 'he' ? 'en' : 'he')}
              className="px-2.5 py-1 text-xs rounded border border-white/10 text-slate-300 hover:text-white hover:border-white/20 transition"
            >
              {lang === 'he' ? 'EN' : 'עב'}
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-white transition p-1">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div className="p-6 overflow-y-auto text-gray-300 text-sm leading-relaxed">
          {type === 'privacy' ? <PrivacyContent lang={lang} /> : <TermsContent lang={lang} />}
        </div>
        <div className="p-4 border-t border-gray-700">
          <button onClick={onClose} className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition">
            {closeLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

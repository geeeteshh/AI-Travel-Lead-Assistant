const express = require('express');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Polyfill WebSocket for Node.js < 22 (required by newer @supabase/supabase-js)
if (typeof global.WebSocket === 'undefined') {
  global.WebSocket = require('ws');
}

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Initialize the Google Gen AI client with the new SDK
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Initialize Supabase Client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
let supabase = null;

if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
  console.log('Supabase client initialized successfully.');
} else {
  console.warn('Supabase URL or Key is missing. Database integration will be disabled (mock sync mode).');
}

// Define the response schema for Gemini Structured Output
const responseSchema = {
  type: "OBJECT",
  properties: {
    reply: {
      type: "STRING",
      description: "A natural, helpful, conversational response. Do not act like a robot; sound like a seasoned travel planner. Ask for missing details one or two at a time."
    },
    extractedData: {
      type: "OBJECT",
      properties: {
        destination: { type: "STRING", description: "Target travel destination (e.g., 'Tokyo, Japan'). Empty string or null if not yet determined." },
        budget: { type: "STRING", description: "Expected budget (e.g., '$3,000', 'budget-friendly', or 'luxury'). Empty string or null if not yet determined." },
        travelMonth: { type: "STRING", description: "Month or specific dates of travel (e.g., 'September 2026'). Empty string or null if not yet determined." },
        travellers: { type: "INTEGER", description: "Number of people travelling. Null if not yet determined." },
        name: { type: "STRING", description: "First name, last name, or full name of the user. Empty string or null if not yet determined." },
        phone: { type: "STRING", description: "Phone number of the user. Empty string or null if not yet determined." }
      },
      required: ["destination", "budget", "travelMonth", "travellers", "name", "phone"]
    },
    leadScore: {
      type: "INTEGER",
      description: "Buying intent score from 0 to 100. Base it on explicit data gathered (each field collected adds score) and implicit customer intent (prompt replies, concrete dates, clear budget, eager/enthusiastic tone)."
    },
    confidence: {
      type: "STRING",
      description: "Confidence evaluation: 'Low', 'Medium', or 'High'."
    },
    reason: {
      type: "STRING",
      description: "A brief, 1-2 sentence explanation of the lead score and confidence level."
    }
  },
  required: ["reply", "extractedData", "leadScore", "confidence", "reason"]
};

// System Instruction for the Gemini agent
const systemInstruction = `
You are an expert, friendly AI Travel Lead Assistant. Your mission is to chat with users, help them plan their dream vacation, and collect key qualifying parameters to log them as a warm sales lead.

You must collect:
1. Destination (Where do they want to go?)
2. Budget (What is their budget or travel tier?)
3. Travel Month / Dates (When are they planning to go?)
4. Travellers (How many people are going?)
5. Name (Who are they?)
6. Phone Number (How can our travel advisor reach them?)

CRITICAL BEHAVIOR & INTENT-DETECTION GUIDELINES:
- Conversational naturalness is key: Do NOT dump a form-like questionnaire. Introduce yourself, greet the user, and ask for details organically.
- Ask questions one or two at a time. Match the flow and vibe of the user's responses.
- Catch parameters early: If a user gives info too early (e.g., "Hi, I'm Sarah and my husband and I want to spend $4000 in Italy this June, call me at 555-0199"), extract ALL parameters immediately in the JSON response payload.
- Handle Edge Cases (Dropouts / Mid-conversation drift): If the user drifts or seems hesitant, try to bring them back gently or explain how getting their number lets our advisors text them custom quotes.
- Intent Scoring (0-100):
  * 0-30 (Low Intent): Vague/casual inquiries, "just looking around", refusing to provide basic details.
  * 31-70 (Medium Intent): Knows destination, dates, and budget, but hasn't shared contact info yet.
  * 71-100 (High Intent): Provided name and phone number (critical), has clear budget/dates, and seems excited/committed.
- The response MUST strictly adhere to the requested JSON structure. Do not output anything outside the JSON.
`;

async function generateContentWithRetry(aiClient, params, retries = 3, delay = 1500) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await aiClient.models.generateContent(params);
    } catch (error) {
      const isTemporary = error.status === 503 || error.status === 429;
      if (isTemporary && attempt < retries) {
        console.warn(`Gemini API returned ${error.status} (attempt ${attempt}/${retries}). Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
      } else {
        throw error;
      }
    }
  }
}

app.post('/api/chat', async (req, res) => {
  try {
    const { message, history } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Missing 'message' in request body." });
    }

    const formattedHistory = [];
    if (Array.isArray(history)) {
      history.forEach((msg) => {
        const role = msg.sender === 'user' ? 'user' : 'model';
        const text = msg.text || '';
        if (text) {
          formattedHistory.push({
            role: role,
            parts: [{ text: text }]
          });
        }
      });
    }

    const contents = [
      ...formattedHistory,
      { role: 'user', parts: [{ text: message }] }
    ];

    console.log(`Sending prompt to Gemini (History Length: ${formattedHistory.length})...`);

    const response = await generateContentWithRetry(ai, {
      model: 'gemini-3-flash-preview',
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.7
      }
    });

    const responseText = response.text;
    console.log('Gemini raw response text:', responseText);

    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse Gemini JSON output:', parseError);
      return res.status(500).json({
        error: "AI model did not return valid JSON.",
        rawText: responseText
      });
    }

    const extracted = result.extractedData || {};
    const hasName = extracted.name && extracted.name.toString().trim() !== '';
    const hasPhone = extracted.phone && extracted.phone.toString().trim() !== '';

    let dbStatus = 'waiting_for_details';

    if (hasName && hasPhone) {
      if (supabase) {
        console.log(`Lead Qualified! Saving to Supabase: Name - ${extracted.name}, Phone - ${extracted.phone}`);

        const phoneKey = extracted.phone.toString().trim();
        let existingVerified = false;
        let existingTelegramChatId = null;
        let existingOtp = null;

        try {
          const { data: existingLead } = await supabase
            .from('leads')
            .select('phone_verified, telegram_chat_id, otp_code')
            .eq('phone', phoneKey)
            .maybeSingle();

          if (existingLead) {
            existingVerified = existingLead.phone_verified || false;
            existingTelegramChatId = existingLead.telegram_chat_id || null;
            existingOtp = existingLead.otp_code || null;
          }
        } catch (findErr) {
          console.warn('Failed to query existing lead verification status:', findErr.message);
        }

        // Generate 6-digit OTP code if not already verified and no code exists
        const otpCode = existingVerified ? null : (existingOtp || Math.floor(100000 + Math.random() * 900000).toString());
        console.log(`[OTP Status] Phone: ${phoneKey}, Verified: ${existingVerified}, OTP: ${otpCode}`);

        const leadRecord = {
          name: extracted.name.toString().trim(),
          phone: phoneKey,
          destination: extracted.destination ? extracted.destination.toString().trim() : null,
          budget: extracted.budget ? extracted.budget.toString().trim() : null,
          travel_month: extracted.travelMonth ? extracted.travelMonth.toString().trim() : null,
          travellers: typeof extracted.travellers === 'number' ? extracted.travellers : null,
          lead_score: result.leadScore || 0,
          confidence: result.confidence || 'Low',
          reason: result.reason || '',
          raw_extracted_data: extracted,
          conversation_history: [
            ...formattedHistory,
            { role: 'user', parts: [{ text: message }] },
            { role: 'model', parts: [{ text: result.reply }] }
          ],
          phone_verified: existingVerified,
          telegram_chat_id: existingTelegramChatId,
          otp_code: otpCode
        };

        const { data, error } = await supabase
          .from('leads')
          .upsert(leadRecord, { onConflict: 'phone' })
          .select();

        if (error) {
          console.error('Error saving lead to Supabase:', error);
          dbStatus = 'sync_error';
        } else {
          console.log('Lead synced successfully:', data);
          dbStatus = existingVerified ? 'verified' : 'synced';
        }
      } else {
        console.log('Database client not configured. Lead qualified (mock sync successful).');
        dbStatus = 'synced_mock';
      }
    }

    // Return the response plus the database sync status
    return res.json({
      ...result,
      dbStatus: dbStatus
    });

  } catch (error) {
    console.error('Error in /api/chat endpoint:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
});

// Helper to send telegram messages
async function sendTelegramMessage(chatId, text, replyMarkup = null) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn(`[Telegram Bot] Message not sent (No TELEGRAM_BOT_TOKEN set in server/.env). Text: "${text}"`);
    return;
  }
  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const body = { chat_id: chatId, text: text };
    if (replyMarkup) body.reply_markup = replyMarkup;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const result = await res.json();
    if (!result.ok) {
      console.error("[Telegram Bot] API error:", result);
    }
  } catch (err) {
    console.error("[Telegram Bot] Network error sending message:", err.message);
  }
}

// Check verification status endpoint (Polled by React Frontend)
app.get('/api/lead-status', async (req, res) => {
  const { phone } = req.query;
  if (!phone) {
    return res.status(400).json({ error: "Missing 'phone' query parameter." });
  }

  const phoneKey = phone.toString().trim();
  if (!supabase) {
    return res.json({ phone_verified: false, telegram_chat_id: null, exists: false, mock: true });
  }

  try {
    const { data, error } = await supabase
      .from('leads')
      .select('phone_verified, telegram_chat_id')
      .eq('phone', phoneKey)
      .maybeSingle();

    if (error) {
      console.error("Error querying lead status:", error);
      return res.status(500).json({ error: error.message });
    }

    if (!data) {
      return res.json({ phone_verified: false, telegram_chat_id: null, exists: false });
    }

    return res.json({
      phone_verified: data.phone_verified || false,
      telegram_chat_id: data.telegram_chat_id || null,
      exists: true
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Mock verification endpoint (Triggered by client developer button)
app.post('/api/mock-verify', async (req, res) => {
  const { phone } = req.body;
  if (!phone) {
    return res.status(400).json({ error: "Missing 'phone' in request body." });
  }

  const phoneKey = phone.toString().trim();
  console.log(`[Mock Verify] Setting phone_verified=true for: ${phoneKey}`);

  if (!supabase) {
    return res.json({ success: true, message: "Mock verified successfully (No database configuration)." });
  }

  try {
    const { data, error } = await supabase
      .from('leads')
      .update({ phone_verified: true, telegram_chat_id: 'mock_telegram_user', otp_code: null })
      .eq('phone', phoneKey)
      .select();

    if (error) {
      console.error("Mock verify database update error:", error);
      return res.status(500).json({ error: error.message });
    }

    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Verify OTP endpoint (Polled/Called by React Frontend)
app.post('/api/verify-otp', async (req, res) => {
  const { phone, otp } = req.body;
  if (!phone || !otp) {
    return res.status(400).json({ error: "Missing 'phone' or 'otp' in request body." });
  }

  const phoneKey = phone.toString().trim();
  const cleanOtp = otp.toString().trim();

  if (!supabase) {
    return res.json({ success: true, message: "Mock verification successful (No DB)" });
  }

  try {
    const { data, error } = await supabase
      .from('leads')
      .select('id, otp_code')
      .eq('phone', phoneKey)
      .maybeSingle();

    if (error) {
      console.error("Error fetching lead for OTP verification:", error);
      return res.status(500).json({ error: error.message });
    }

    if (!data) {
      return res.status(404).json({ error: "Lead not found." });
    }

    if (data.otp_code === cleanOtp) {
      // OTP matches, mark verified and clear OTP code
      const { error: updateError } = await supabase
        .from('leads')
        .update({ phone_verified: true, otp_code: null })
        .eq('id', data.id);

      if (updateError) {
        console.error("Error updating phone_verified status:", updateError);
        return res.status(500).json({ error: updateError.message });
      }

      return res.json({ success: true });
    } else {
      return res.status(400).json({ error: "Invalid verification code. Please try again." });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Telegram bot webhook endpoint
app.post('/api/telegram-webhook', async (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.sendStatus(200);
  }

  const chatId = message.chat.id;
  const text = message.text;
  const contact = message.contact;

  console.log(`[Telegram Webhook] Event from Chat ID: ${chatId}`);

  try {
    if (text && text.startsWith('/start')) {
      const args = text.split(' ');
      if (args.length > 1) {
        const phoneToVerify = args[1].trim();
        const cleanPhone = phoneToVerify.replace(/\D/g, '');
        const last10Digits = cleanPhone.slice(-10);
        console.log(`[Telegram Webhook] Start deep link. Raw: ${phoneToVerify}, Last10: ${last10Digits}`);
        
        if (supabase) {
          // Find existing lead
          const { data: existingLeads } = await supabase
            .from('leads')
            .select('id, otp_code')
            .or(`phone.eq.${phoneToVerify},phone.eq.${cleanPhone},phone.ilike.%${last10Digits}`);

          if (existingLeads && existingLeads.length > 0) {
            const matchedLead = existingLeads[0];
            let otp = matchedLead.otp_code;
            if (!otp) {
              otp = Math.floor(100000 + Math.random() * 900000).toString();
              await supabase.from('leads').update({ otp_code: otp, telegram_chat_id: chatId.toString() }).eq('id', matchedLead.id);
            } else {
              await supabase.from('leads').update({ telegram_chat_id: chatId.toString() }).eq('id', matchedLead.id);
            }

            await sendTelegramMessage(
              chatId,
              `🔑 Welcome to AI Travel Assistant!\n\nYour 6-digit verification code is: **${otp}**\n\nPlease enter this code on the website dashboard to complete verification.`,
              {
                keyboard: [[{ text: "📱 Verify instantly by sharing contact instead", request_contact: true }]],
                one_time_keyboard: true,
                resize_keyboard: true
              }
            );
          } else {
            await sendTelegramMessage(
              chatId,
              `❌ We couldn't find a matching lead request for phone number: ${phoneToVerify}. Please make sure you completed the form on the website first.`
            );
          }
        } else {
          // Mock webhook
          await sendTelegramMessage(
            chatId,
            `🔑 (Mock Server) Your 6-digit verification code is: **123456**\n\nEnter it on the website chat dashboard.`,
            {
              keyboard: [[{ text: "📱 Verify instantly by sharing contact instead", request_contact: true }]],
              one_time_keyboard: true,
              resize_keyboard: true
            }
          );
        }
      } else {
        await sendTelegramMessage(
          chatId,
          "Welcome to AI Travel Assistant Bot! Please use the 'Verify via Telegram' link on our website dashboard to receive your OTP code."
        );
      }
    } else if (contact) {
      // Security check: Verify contact matches the sender
      const contactUserId = contact.user_id;
      const senderId = message.from.id;

      if (contactUserId !== senderId) {
        await sendTelegramMessage(chatId, "❌ Verification failed. You must share your own contact info.");
        return res.sendStatus(200);
      }

      const rawPhone = contact.phone_number.toString().trim();
      const cleanPhone = rawPhone.replace(/\D/g, ''); // Extract only digits
      const last10Digits = cleanPhone.slice(-10);

      console.log(`[Telegram Webhook] Contact shared. Raw: ${rawPhone}, Cleaned: ${cleanPhone}, Last10: ${last10Digits}`);

      if (supabase) {
        const { data: existingLeads, error: findError } = await supabase
          .from('leads')
          .select('id, phone')
          .or(`phone.eq.${rawPhone},phone.eq.${cleanPhone},phone.ilike.%${last10Digits}`);

        if (findError || !existingLeads || existingLeads.length === 0) {
          console.warn(`[Telegram Webhook] No lead match found for contact: ${last10Digits}`);
          await sendTelegramMessage(
            chatId,
            `❌ Verification failed. We couldn't find a matching lead request for phone number: ${rawPhone}. Please make sure the phone number in the chat matches this Telegram account.`
          );
        } else {
          const matchedLead = existingLeads[0];
          console.log(`[Telegram Webhook] Found match: Lead ID ${matchedLead.id}`);

          const { error: updateError } = await supabase
            .from('leads')
            .update({ phone_verified: true, telegram_chat_id: chatId.toString(), otp_code: null })
            .eq('id', matchedLead.id);

          if (updateError) {
            console.error("[Telegram Webhook] Error updating verification flag:", updateError);
            await sendTelegramMessage(chatId, "❌ Database update failed. Please try again later.");
          } else {
            await sendTelegramMessage(
              chatId,
              "✅ Thank you! Your phone number has been successfully verified. You can return to the website dashboard now.",
              { remove_keyboard: true }
            );
          }
        }
      } else {
        await sendTelegramMessage(
          chatId,
          "✅ (Mock Server) Your phone number was verified successfully!",
          { remove_keyboard: true }
        );
      }
    }
  } catch (err) {
    console.error("[Telegram Webhook] Error handling update:", err.message);
  }

  return res.sendStatus(200);
});

// Simple health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', supabaseConfigured: !!supabase });
});

// Helper function to manage automated localhost.run SSH tunnel
function startAutomatedTunnel() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log('[Tunnel] TELEGRAM_BOT_TOKEN not configured. Automated webhook tunnel disabled.');
    return;
  }

  console.log('[Tunnel] Starting automated localhost.run tunnel on port 5000...');
  const { spawn } = require('child_process');
  
  // Spawn the ssh connection to localhost.run
  const tunnelProcess = spawn('ssh', [
    '-o', 'StrictHostKeyChecking=no',
    '-R', '80:localhost:5000',
    'nokey@localhost.run'
  ]);

  tunnelProcess.stdout.on('data', async (data) => {
    const output = data.toString();
    
    // Look for the lhr.life HTTPS URL pattern in localhost.run logs
    const match = output.match(/https:\/\/[a-zA-Z0-9]+\.lhr\.life/);
    if (match) {
      const publicUrl = match[0];
      console.log(`[Tunnel] Public tunnel URL generated: ${publicUrl}`);
      
      const webhookUrl = `${publicUrl}/api/telegram-webhook`;
      const telegramApiUrl = `https://api.telegram.org/bot${token}/setWebhook?url=${webhookUrl}`;
      
      try {
        const res = await fetch(telegramApiUrl);
        const result = await res.json();
        if (result.ok) {
          console.log(`[Telegram Bot] Webhook successfully registered to: ${webhookUrl}`);
        } else {
          console.error(`[Telegram Bot] Webhook registration failed:`, result);
        }
      } catch (err) {
        console.error(`[Telegram Bot] Webhook request error:`, err.message);
      }
    }
  });

  tunnelProcess.stderr.on('data', (data) => {
    const errorMsg = data.toString().trim();
    if (errorMsg && !errorMsg.includes('Warning: Permanently added')) {
      console.warn(`[Tunnel Warning] ${errorMsg}`);
    }
  });

  tunnelProcess.on('close', (code) => {
    console.log(`[Tunnel] Connection closed with code ${code}. Retrying in 8 seconds...`);
    setTimeout(startAutomatedTunnel, 8000);
  });
}

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  startAutomatedTunnel();
});

// Graceful shutdown to clean up port resources on terminate signals
const shutdown = () => {
  console.log('Shutdown signal received. Closing server port 5000...');
  server.close(() => {
    console.log('Server port closed. Exiting process.');
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

# AI-Powered Travel Lead Assistant

This is a production-ready, modular boilerplate for an **AI-Powered Travel Lead Assistant**. The application acts as a friendly chat-based travel planner, extracts travel details (destination, budget, travel date, travellers), scores the customer's buying intent (0-100), and automatically logs/upserts them as a warm lead in a Supabase PostgreSQL database once their name and phone number are gathered.

---

## Features

- **Dual-Purpose AI Layer**: Configured with Google Gemini API using the official `@google/genai` Node.js SDK and Structured JSON Output Mode. The model returns both conversational messages and structured client metadata in a single response.
- **Split-Screen Interface**:
  - **Left (70%)**: Interactive chat box where users converse naturally with the travel assistant.
  - **Right (30%)**: Live Lead Tracker dashboard displaying a real-time extraction checklist, lead score intent progress bar, and database synchronization status.
- **Database Integration**: Powered by Supabase PostgreSQL. Automatically upserts lead records by checking if name and phone numbers are present, bypassing duplication issues by using the phone number as a unique conflict resolver.
- **Intent Scoring Engine**: Logical intent scoring (0-100) combining explicit parameter collection and implicit buying signals (enthusiasm, specific budget constraints, exact dates).

---

## Directory Structure

```
AI Travel Lead Assisstant/
├── README.md                    # Setup and running documentation
├── schema.sql                   # Supabase PostgreSQL database DDL
├── server/                      # Node.js/Express Backend
│   ├── .env.example             # Template for API keys
│   ├── package.json             # Server dependencies and start scripts
│   └── server.js                # Server entry point, Gemini client, & database sync
└── client/                      # React Frontend
    ├── index.html               # Main HTML wrapper (with Outfit & Inter fonts)
    ├── package.json             # React and build dependencies
    ├── vite.config.js           # Vite config with dev proxy to server
    ├── tailwind.config.js       # Tailwind CSS configurations
    ├── postcss.config.js        # PostCSS configuration
    └── src/
        ├── index.css            # Base Tailwind and custom styles
        ├── main.jsx             # React mounting file
        ├── App.jsx              # App layout, state, API hookup
        └── components/
            ├── ChatWindow.jsx   # Left-side chat panel
            └── LeadDashboard.jsx # Right-side live data tracker panel
```

---

## Getting Started

### 1. Database Setup (Supabase)
1. Go to [Supabase](https://supabase.com/) and create a new project.
2. In the **SQL Editor**, paste the contents of [schema.sql](schema.sql) and run it to set up the `leads` table and its indexes.

### 2. Environment Variables
1. Navigate to the `server` directory.
2. Copy `.env.example` to a new file named `.env`:
   ```bash
   cp .env.example .env
   ```
3. Open `.env` and fill in the following details:
   - `GEMINI_API_KEY`: Your Gemini API key from [Google AI Studio](https://aistudio.google.com/).
   - `SUPABASE_URL`: Your Supabase Project URL (Settings -> API).
   - `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase Service Role API Key (Settings -> API -> `service_role` key).
   *Note: If you leave Supabase URL/Key blank, the server will operate in a mock database mode (showing client state updates but simulating DB writes).*

### 3. Run the Backend Server
From the root directory:
```bash
cd server
npm install
npm run dev
```
The server will start on [http://localhost:5000](http://localhost:5000).

### 4. Run the React Client
From the root directory (in a new terminal):
```bash
cd client
npm install
npm run dev
```
The client will launch on [http://localhost:3000](http://localhost:3000).

---

## Edge Case Handling Logic

1. **Information Provided Too Early**: The system instructions guide Gemini to extract *all* parameters immediately if the user specifies details in their opening greeting. The extractor will map them to the live dashboard checklist instantly.
2. **User Drops Out Mid-Conversation**: The database integration is trigger-based. As soon as the AI successfully parses a `name` and `phone` from the transcript, the lead is immediately synced. Any further details provided later will upsert the same row.
3. **Intent-Detection Logic**:
   - **Low Intent (0-30)**: Casual browsing, avoiding specific responses, rejecting sharing contact info.
   - **Medium Intent (31-70)**: Expressing destination or budget preferences but missing critical contact details.
   - **High Intent (71-100)**: Providing name/phone, giving specific dates, and showing active interest in completing the booking.

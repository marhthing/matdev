# Overview
MATDEV is a high-performance WhatsApp bot built with Node.js and the Baileys library. It prioritizes reliability, security, and advanced media processing. Key features include automatic session management, anti-ban protection, comprehensive caching, and a modular plugin system for extensibility. The project aims to provide a robust and versatile bot solution for various communication and automation needs on WhatsApp.

# User Preferences
Preferred communication style: Simple, everyday language.

# System Architecture
## Core Architecture
The system employs a modular, object-oriented design with distinct components:
- **Main Bot Class (MATDEV)**: Central orchestrator managing components and connection state.
- **Connection Manager**: Handles WebSocket connections with intelligent reconnection and backoff strategies.
- **Session Manager**: Manages WhatsApp authentication sessions with automatic QR code handling.
- **Message Handler**: Processes incoming messages, routes commands, and applies middleware.
- **Security Manager**: Implements anti-ban protection, rate limiting, and threat detection.
- **Cache Manager**: Multi-tier caching system for optimal performance.

## Design Patterns
- **Singleton Pattern**: Ensures single instantiation of manager classes.
- **Plugin Architecture**: Enables modular command system for easy extension.
- **Middleware Pattern**: Utilizes a message processing pipeline.
- **Observer Pattern**: Implements an event-driven architecture for state changes and message handling.

## Message Processing Pipeline
The pipeline involves raw message ingestion, security filtering, message info extraction, middleware processing, command routing, and response generation.

## Security Features
Includes rate limiting, anti-ban protection, suspicious activity detection, role-based command authorization, and a group LID registration system for WhatsApp Business accounts with validation.

## Performance Optimizations
Features multi-tier caching for various data types, concurrent processing, smart media handling (compression, format conversion), and memory management with periodic cleanup.

## UI/UX Decisions
- Clean console output by minimizing verbose logging.
- Sticker creation output is concise: "✅ Sticker".
- Enhanced emoji pool for message reactions.
- Streamlined auto-react commands for better user experience.
- All AI commands produce professional output without unnecessary verbose logging.

## Technical Implementations
- **YouTube Plugin v5.0.0**: Complete rewrite using @distube/ytdl-core with advanced proxy support for IP masking. Features include proxy rotation, user-agent randomization, strict format filtering (excludes HLS/DASH), hard size constraints (14MB video, 12MB audio), and intelligent quality degradation.
- **Proxy Support**: Full HTTP/HTTPS and SOCKS proxy support to bypass hosting platform detection ("bot detection" errors). Includes automatic proxy rotation and realistic browser headers.
- **Currency Conversion Plugin**: Supports 170+ currencies with real-time conversion and smart formatting.
- **Weather Plugin**: Global location support using OpenWeatherMap API, displaying rich weather data with visual enhancements.
- **Group LID Registration System**: One-time registration for WhatsApp Business accounts, owner management, and persistent storage.
- **Auto React System**: Streamlined commands, expanded emoji pool, and configurable delays.
- **Delay Controls**: Added delay/nodelay options to autoreact systems with configurable delays.
- **Groq AI Integration**: Enhanced TTS (silent generation), STT (clean output), and Vision (direct image caption support, dual image support).
- **Scheduling Plugin**: Persistent message scheduling with timezone support (Lagos/Nigeria), auto-execution, and schedule management.
- **New Utility Plugin Suite (September 13, 2025)**: Added 11 standalone utility plugins with comprehensive functionality:
  - **Unit Converter**: Multi-category conversion (length, weight, temperature, volume) with support for 25+ units
  - **URL Shortener**: TinyURL integration with expansion capabilities and size reduction metrics
  - **Base64 Encoder/Decoder**: Full encode/decode with binary data detection and validation
  - **Hash Generator**: Multi-algorithm support (MD5, SHA1, SHA256, SHA512) for text and files
  - **Translation**: Multi-language translation using free APIs with 30+ language support
  - **Wikipedia**: Article search and summary extraction with formatted output
  - **News Feed**: Category-based news with RSS fallback and multiple source support
  - **Reminder System**: Persistent scheduling with JSON storage, timezone handling, and auto-execution
  - **Quote Generator**: Daily quotes, category filters, and author search with fallback database
  - **Screenshot Text (OCR)**: Image text extraction with multiple OCR service fallbacks
  - **PDF Tools**: Document generation from text with HTML formatting and metadata

# Current Deployment Status
## Replit Setup (September 13, 2025) - Import Completed Successfully
- **Status**: ✅ Successfully imported and fully operational on Replit
- **Entry Point**: bot.js (main WhatsApp bot application)
- **Workflow**: "MATDEV Bot" running on Node.js console output (configured for continuous operation)
- **Dependencies**: All required packages installed and working (526 packages)
- **Environment**: Auto-configured with intelligent defaults via config.js
- **Connection**: ✅ WhatsApp session established and authenticated (Bot Number: 2347018091555)
- **Owner Number**: Auto-configured to 2347018091555 from authenticated connection
- **Plugins**: All 37 plugins loaded successfully, including:
  - Anti-delete, Anti-view once, Auto-react, Currency conversion
  - Download, YouTube, TikTok, Twitter, Instagram
  - AI integrations (Gemini, Groq), Weather, Media processing
  - Group management, QR generation, scheduling, and upscaling features
  - **New Utility Plugins (11 total)**: Unit Converter, URL Shortener, Base64 Encoder/Decoder, Hash Generator, Translation, Wikipedia, News Feed, Reminder System, Quote Generator, Screenshot Text (OCR), PDF Tools
- **AI Generator Plugin**: ✅ **Fixed September 13, 2025** - Only working commands are available:
  - `.image` - AI image generation (Pollinations.ai) ✅ Working
  - `.write` - Text generation (Pollinations.ai) ✅ Working  
  - `.style` - Style artwork generation (Pollinations.ai) ✅ Working
  - `.video/.animate/.music` - Removed (non-working commands commented out)
  - **File**: `ai-generator.js` (renamed from image.js for accuracy)
- **Deployment**: Configured for VM deployment (continuous operation)

## Configuration Files
- **bot.js**: Main application entry point
- **index.js**: Auto-manager system for deployment automation
- **config.js**: Environment configuration with intelligent defaults
- **.env**: Created with base configuration and safe defaults
- **package.json**: All dependencies properly configured

## Environment Variables
### Required Variables
- **OWNER_NUMBER**: Auto-configured from authenticated WhatsApp number
- **BOT_NAME**: Default "MATDEV" (customizable)

### Optional Variables (with safe defaults)
- **PREFIX**: Command prefix (default: ".")
- **PUBLIC_MODE**: Bot accessibility (default: false - private mode)
- **AUTO_TYPING**, **AUTO_READ**, **AUTO_STATUS_VIEW**: Behavior flags (default: false)
- **WEATHER_API_KEY**, **REMOVE_BG_API_KEY**: External API keys for enhanced features
- **LOG_LEVEL**: Logging verbosity (default: "info")

## Operations & Management
### Workflow Control
- **Start/Stop**: Use Replit workflow controls or restart via console
- **Logs**: Available at `/tmp/logs/MATDEV_Bot_[timestamp].log`
- **Monitoring**: Console output shows connection status and plugin activity

### Authentication & Session Management
- **Initial Setup**: QR code displayed in console for WhatsApp pairing
- **Session Recovery**: If logged out, clear `session/auth/` directory and restart
- **Backup**: Session credentials stored in `session/auth/` (auto-managed)

### File Persistence & Storage
- **Session Data**: `session/auth/` (WhatsApp credentials)
- **Media Processing**: `tmp/` (temporary files, auto-cleanup)
- **Plugin Storage**: `session/storage/` (JSON-based data)
- **Message Schedules**: Persistent storage with timezone support

## Replit Environment Features
- Auto-restart on crashes (max 5 attempts)
- Session persistence across restarts
- Automatic dependency management
- Hot reload system for plugin development
- Console logging for monitoring and debugging

## Security & Secrets
- **Git Ignore**: Ensure `session/` and `tmp/` directories excluded from VCS
- **Credential Safety**: WhatsApp session files should never be committed
- **Session Rotation**: Clear `session/auth/` and re-authenticate if credentials compromised

# External Dependencies
## Core Libraries
- **@whiskeysockets/baileys**: WhatsApp Web API.
- **winston**: Advanced logging system.
- **node-cache**: In-memory caching.
- **fs-extra**: Enhanced file system operations.
- **moment-timezone**: Date/time manipulation with timezone support.
- **chalk**: Terminal output coloring.
- **qrcode-terminal**: QR code generation.

## Media Processing
- **FFmpeg**: For media format conversion and manipulation.

## Deployment Platforms
- **Replit**: Primary deployment target for continuous operation (currently active).
- **Heroku**: Alternative deployment target.

## Optional External APIs
- **OpenWeatherMap API**: For weather information (requires API key).
- **Fawaz Ahmed Currency API**: For currency conversion (no API key required).

## Session and Data Storage
- Local file system for WhatsApp authentication credentials.
- JSON-based session persistence with automatic backup.
- Temporary directory management for media processing.
- JSON-based persistent storage for Group LID registrations.
- JSON-based storage for message schedules.
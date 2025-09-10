# Overview

MATDEV is a high-performance WhatsApp bot built with Node.js and the Baileys library. It's designed for reliability, security, and advanced media processing capabilities. The bot features automatic session management, anti-ban protection, comprehensive caching, and a modular plugin system for easy extensibility.

# Recent Changes

## September 10, 2025 - Weather Plugin Implementation ✅
- **NEW FEATURE**: Complete weather plugin with global location support
- Added `.weather` and `.w` commands for weather information lookup
- **OpenWeatherMap Integration**: Uses OpenWeatherMap API for accurate weather data
- **Global Coverage**: Supports cities, countries, and coordinates worldwide
- **Smart Location Recognition**: Handles city names, country codes, and lat/lon coordinates
- **Rich Weather Display**: Shows temperature, humidity, wind, pressure, visibility, sunrise/sunset
- **Visual Enhancements**: Weather condition icons and country flags
- **Error Handling**: Comprehensive error handling for invalid locations and API issues
- **Free Tier Ready**: Optimized for OpenWeatherMap's free tier (1,000 calls/day)
- **Hot Reload Support**: Plugin automatically loaded via bot's hot reload system

## September 4, 2025 - Group LID Registration System Implementation
- **NEW FEATURE**: Complete group LID registration system for WhatsApp Business accounts
- Added `.rg` command for one-time LID registration in groups (becomes invalid after registration)
- Added `.clearlid` command for owner to clear registered LID
- Added `.lidinfo` command for owner to view LID registration status
- Extended JSON storage system to support persistent group LID data storage
- All LID commands implement proper validation and permission checks
- System handles WhatsApp's new LID format and business account requirements

## September 9, 2025 - Fresh Replit Environment Setup Complete ✅
- **COMPLETED**: Successfully imported GitHub project to fresh Replit environment
- **COMPLETED**: Installed all Node.js dependencies (Node.js v20.19.3) via npm install
- **COMPLETED**: Created required directories automatically during bot startup
- **COMPLETED**: Set up workflow "MATDEV Bot" with proper console output monitoring
- **COMPLETED**: Configured VM deployment for continuous 24/7 operation
- **COMPLETED**: Bot starts successfully and connects to WhatsApp automatically
- **COMPLETED**: All 19 plugins load correctly including new plugins (gemini, autobio, autoreact, etc.)
- **COMPLETED**: Environment configuration validated (.env file auto-created with defaults)
- **COMPLETED**: Owner number auto-detection and configuration working (2347018091555)
- **COMPLETED**: Security manager initialized with anti-ban protection
- **COMPLETED**: JSON storage system operational for message archiving
- **COMPLETED**: Hot reload system enabled for plugin development
- **COMPLETED**: VM deployment configuration set for production using node bot.js
- **COMPLETED**: Fixed caption editor plugin to work silently without success messages
- **COMPLETED**: WhatsApp connection established successfully (Bot Number: 2347018091555, Bot Name: POF)
- **COMPLETED**: All 19 plugins initialized successfully with hot reload system
- **COMPLETED**: Startup confirmation sent to bot private chat
- **COMPLETED**: Fixed Groq AI vision commands (.ask and .describe) to support direct image captions
- **STATUS**: Bot is fully operational with complete AI capabilities (TTS, STT, Vision) - ready for production

## September 9, 2025 - Auto React System Simplification ✅
- **SIMPLIFIED COMMANDS**: Streamlined autoreact system from 6 commands to just 2 core commands
- **REMOVED COMMANDS**: Eliminated .reactchance, .keywordreact, .addreaction, .reactions, .reactstatus
- **NEW STRUCTURE**: Simplified to .autoreact (on/off/status) and .sautoreact (on/off/status)
- **MERGED PLUGINS**: Combined autostatusreact functionality into main autoreact plugin
- **CONFIG INTEGRATION**: Added AUTO_REACT and STATUS_AUTO_REACT to config.js and .env defaults
- **ENHANCED EMOJIS**: Expanded message reaction pool to 120+ emojis with 80+ keyword patterns
- **FIXED STATUS REACTIONS**: Set default status reactions to "❤💙💚" (non-configurable)
- **PLUGIN REDUCTION**: Reduced from 19 to 18 plugins by merging status react functionality
- **AUTO-ENABLE**: Both features can be auto-enabled from environment variables
- **IMPROVED UX**: Cleaner command structure with comprehensive status displays

## September 9, 2025 - Delay Controls & Alias Cleanup ✅
- **DELAY CONTROLS**: Added delay/nodelay options to autoreact system
- **NEW COMMANDS**: .autoreact delay/nodelay and .sautoreact delay/nodelay
- **CONFIG INTEGRATION**: Added REACT_DELAY and STATUS_REACT_DELAY to config.js and .env
- **DEFAULT BEHAVIOR**: Default is "nodelay" (instant reactions) for immediate response
- **DELAY OPTIONS**: Message reactions: 0.5-2.5s delay, Status reactions: 30s-5min delay
- **ALIAS REMOVAL**: Removed all alias commands from plugins for cleaner command structure
- **REMOVED ALIASES**: Eliminated tt, ai, ac/ec/rc/cc, pm, wc, tz aliases across all plugins
- **CLEANER STRUCTURE**: Simplified command system with only primary commands available
- **ENHANCED STATUS**: Updated status displays to show current delay mode settings

## September 7, 2025 - Console Output Cleanup & Scheduling Plugin ✅
- **COMPLETED**: Cleaned up console output by commenting out verbose logging
- **COMPLETED**: Removed spammy message processing, archival, and command execution logs
- **COMPLETED**: Fixed sticker creation output to show only "✅ Sticker" confirmation
- **COMPLETED**: Set timezone to Lagos/Nigeria (Africa/Lagos) in configuration
- **NEW FEATURE**: Complete scheduling plugin with persistent storage
- Added `.schedule dd:mm:yyyy hh:mm <jid> [message]` command for direct message scheduling
- Added support for replying to messages and scheduling them with `.schedule dd:mm:yyyy hh:mm <jid>`
- Added `.schedules` command to list all pending schedules with timing information
- Added `.cancelschedule <id>` command to cancel specific scheduled messages
- **PERSISTENT**: Schedules survive bot restarts and updates via JSON storage
- **TIMEZONE**: All scheduling uses Lagos/Nigeria timezone for accurate timing
- **AUTO-CHECK**: System automatically checks and sends scheduled messages every minute
- Console now shows clean, professional output with essential information only

## September 9, 2025 - Complete Groq AI Integration ✅
- **ENHANCED TTS**: Voice notes now generate silently without feedback messages - seamless user experience
- **ENHANCED STT**: Audio transcription without "Audio Transcription:" header - clean output
- **ENHANCED VISION**: Both `.ask` and `.describe` commands now support direct image captions
- **DUAL IMAGE SUPPORT**: Send image with `.ask <question>` caption OR reply to image with `.ask <question>`
- **FLEXIBLE USAGE**: Image commands work like sticker command - maximum flexibility for users
- **LATEST MODELS**: Uses Groq's newest APIs (PlayAI TTS, Whisper turbo, Llama Scout Vision)
- **CLEAN OUTPUT**: All AI commands produce professional output without unnecessary verbose logging
- **FULL FUNCTIONALITY**: Complete AI suite - text generation, voice synthesis, speech recognition, image analysis

# User Preferences

Preferred communication style: Simple, everyday language.

## Bot Operation Notes
- Bot is operational and displaying QR code for WhatsApp connection
- All 20 plugins loaded successfully including new weather plugin
- Update commands (.update, .updatenow) are owner-only and working correctly
- Weather plugin ready (requires WEATHER_API_KEY for OpenWeatherMap)
- Bot ready for production deployment as VM service

# System Architecture

## Core Architecture
The system follows a modular, object-oriented design with clear separation of concerns:

- **Main Bot Class (MATDEV)** - Central orchestrator that manages all components and maintains connection state
- **Connection Manager** - Handles WebSocket connections with intelligent reconnection strategies and backoff algorithms
- **Session Manager** - Manages WhatsApp authentication sessions with automatic QR code handling and pairing
- **Message Handler** - Processes incoming messages, routes commands, and applies middleware
- **Security Manager** - Implements anti-ban protection, rate limiting, and threat detection
- **Cache Manager** - Multi-tier caching system for optimal performance with separate stores for different data types

## Design Patterns
- **Singleton Pattern** - Each manager class is instantiated once and shared across the application
- **Plugin Architecture** - Modular command system allowing easy extension without core modifications
- **Middleware Pattern** - Message processing pipeline with configurable middleware chains
- **Observer Pattern** - Event-driven architecture for connection state changes and message handling

## Message Processing Pipeline
1. Raw message ingestion from Baileys WebSocket
2. Security filtering and rate limiting checks
3. Message info extraction and normalization
4. Middleware processing chain
5. Command routing and execution
6. Response generation and delivery

## Security Features
- **Rate Limiting** - Per-user message limits with sliding window algorithm
- **Anti-Ban Protection** - Intelligent message delays and burst control
- **Suspicious Activity Detection** - Pattern recognition for spam and abuse
- **Command Authorization** - Role-based access control with owner-only commands
- **Group LID Registration** - One-time registration system for WhatsApp Business accounts
- **LID Validation** - Validates WhatsApp Business LID format and prevents duplicate registrations

## Performance Optimizations
- **Multi-tier Caching** - Separate caches for messages, users, groups, and media with different TTL settings
- **Concurrent Processing** - Configurable message processing limits to prevent overload
- **Smart Media Handling** - Automatic compression and format conversion with size limits
- **Memory Management** - Periodic cleanup tasks and garbage collection optimization

# External Dependencies

## Core Libraries
- **@whiskeysockets/baileys** - WhatsApp Web API implementation for bot connectivity
- **winston** - Advanced logging system with multiple outputs and log levels
- **node-cache** - In-memory caching for high-performance data storage
- **fs-extra** - Enhanced file system operations with promise support
- **moment-timezone** - Date/time manipulation with timezone support
- **chalk** - Terminal output coloring for enhanced logging visibility
- **qrcode-terminal** - QR code generation for WhatsApp pairing process

## Media Processing
- **FFmpeg** (via Heroku buildpack) - Media format conversion and manipulation
- File system operations for temporary media storage and cleanup

## Deployment Platforms
- **Replit** - Primary deployment target with VM configuration for continuous operation
- **Heroku** - Alternative deployment target with worker dyno configuration
- Custom buildpacks for FFmpeg integration
- Environment variable configuration for easy deployment

## Optional External APIs
- **OpenWeatherMap API** - Weather information commands (.weather, .w) with global coverage (API key required)
- **News API** - News fetching functionality (API key required)
- **Remove.bg API** - Background removal for images (API key required)

## Session Storage
- Local file system for WhatsApp authentication credentials
- JSON-based session persistence with automatic backup capabilities
- Temporary directory management for media processing workflows
- **Group LID Storage** - Persistent storage for WhatsApp Business LID registrations
- **Permission Management** - JSON-based storage for user command permissions

## Group LID Management System
- **One-time Registration** - Users can register their WhatsApp Business LID once per system
- **Group-only Registration** - LID registration only works in group chats for security
- **Owner Management** - Bot owner can clear registrations and view LID information
- **Business Account Support** - Handles WhatsApp's new LID format for business accounts
- **Registration Prevention** - Once registered, prevents additional registrations until cleared

## Message Scheduling System
- **Persistent Storage** - Schedules saved to JSON file and survive bot restarts/updates
- **Timezone Support** - All scheduling uses Lagos/Nigeria timezone (Africa/Lagos)
- **Dual Format Support** - Direct message scheduling or reply-to-message scheduling
- **Auto-execution** - Automatic message sending system with minute-level precision
- **Schedule Management** - List, view, and cancel pending schedules
- **Startup Recovery** - Automatically loads and resumes pending schedules on bot restart
- **Cleanup System** - Past schedules automatically cleaned up to prevent storage bloat
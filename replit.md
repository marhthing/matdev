# Overview

MATDEV is a high-performance WhatsApp bot built with Node.js and the Baileys library. It's designed for reliability, security, and advanced media processing capabilities. The bot features automatic session management, anti-ban protection, comprehensive caching, and a modular plugin system for easy extensibility.

# Recent Changes

## September 4, 2025 - Group LID Registration System Implementation
- **NEW FEATURE**: Complete group LID registration system for WhatsApp Business accounts
- Added `.rg` command for one-time LID registration in groups (becomes invalid after registration)
- Added `.clearlid` command for owner to clear registered LID
- Added `.lidinfo` command for owner to view LID registration status
- Extended JSON storage system to support persistent group LID data storage
- All LID commands implement proper validation and permission checks
- System handles WhatsApp's new LID format and business account requirements

## September 7, 2025 - Fresh Replit Environment Setup Complete ✅
- **COMPLETED**: Successfully imported GitHub project to fresh Replit environment
- **COMPLETED**: Installed all Node.js dependencies (Node.js v20.19.3) 
- **COMPLETED**: Created required directories (session/auth, session/media, session/storage, session/viewonce, tmp)
- **COMPLETED**: Set up workflow "MATDEV Bot" with proper console output monitoring
- **COMPLETED**: Configured VM deployment for continuous 24/7 operation
- **COMPLETED**: Bot starts successfully and connects to WhatsApp automatically
- **COMPLETED**: All 7 plugins load correctly (antidelete, antiviewonce, core, media, schedule, status, system)
- **COMPLETED**: Environment configuration validated (.env file auto-created with defaults)
- **COMPLETED**: Owner number auto-detection and configuration working (2347018091555)
- **COMPLETED**: Security manager initialized with anti-ban protection
- **COMPLETED**: JSON storage system operational for message archiving
- **COMPLETED**: Hot reload system enabled for plugin development
- **COMPLETED**: VM deployment configuration set for production
- **STATUS**: Bot is fully operational, connected, and processing messages successfully

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

## September 7, 2025 - Gemini AI Plugin Integration ✅
- **NEW PLUGIN**: Added Gemini AI integration plugin with Google Generative AI support
- **COMMANDS**: Added `.gemini <prompt>` and `.ai <prompt>` commands for AI conversations
- **API INTEGRATION**: Uses existing `.setenv` system for GEMINI_API_KEY management
- **ERROR HANDLING**: Smart error handling for missing/invalid API keys and quota limits
- **UX ENHANCEMENT**: Message editing functionality - "🤖 Thinking..." gets replaced with AI response
- **BRANDING**: Responses show "🤖 *MATDEV AI Response:*" header for consistent branding
- **MODEL**: Uses latest gemini-1.5-flash model for optimal performance and reliability
- Bot now supports 12 plugins total including full AI conversation capabilities

# User Preferences

Preferred communication style: Simple, everyday language.

## Bot Operation Notes
- Bot is operational and displaying QR code for WhatsApp connection
- All 6 plugins loaded successfully 
- Update commands (.update, .updatenow) are owner-only and working correctly
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
- **Weather API** - Weather information commands (API key required)
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
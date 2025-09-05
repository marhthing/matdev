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

## September 5, 2025 - Fresh Replit Environment Setup Complete ✅
- **COMPLETED**: Successfully re-imported GitHub project to fresh Replit environment
- **COMPLETED**: Installed all Node.js dependencies (Node.js v20.19.3)
- **COMPLETED**: Created required directories (session, tmp)
- **COMPLETED**: Set up workflow "MATDEV Bot" with console output monitoring
- **COMPLETED**: Configured VM deployment for continuous operation
- **COMPLETED**: Bot starts successfully and displays QR code for WhatsApp authentication
- **COMPLETED**: All plugins load correctly (antidelete, antiviewonce, core, media, status, system - 6 plugins total)
- **COMPLETED**: Environment configuration validated (.env file created with defaults)
- **COMPLETED**: All core modules and libraries verified working
- **STATUS**: Bot is ready for WhatsApp authentication via QR code scan

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
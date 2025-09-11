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
- **Replit**: Primary deployment target for continuous operation.
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
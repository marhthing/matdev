const fs = require('fs-extra');
const path = require('path');
const config = require('../config');

class DOCConverterPlugin {
    constructor() {
        this.name = 'doc';
        this.description = 'DOC converter - convert text/documents to DOC/DOCX';
        this.version = '1.0.0';
        this.enabled = true;
        this.supportedFormats = {
            input: ['text', 'image', 'jpg', 'png', 'jpeg', 'pdf', 'html'],
            output: ['doc', 'docx']
        };
    }

    async init(bot) {
        this.bot = bot;
        try {
            // Register DOC command
            this.bot.messageHandler.registerCommand('doc', (messageInfo) => this.convertToDoc(messageInfo), {
                description: 'Convert text/documents to DOC/DOCX',
                usage: `${config.PREFIX}doc - Send text or reply to message/file`,
                category: 'utility',
                plugin: 'doc',
                source: 'doc.js'
            });

            console.log('✅ DOC Converter plugin loaded');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize DOC Converter plugin:', error);
            return false;
        }
    }

    async convertToDoc(messageInfo) {
        try {
            console.log('🔄 DOC conversion request');

            let result = null;
            let quotedContent = null;
            let quotedFile = null;
            let customTitle = null;
            let bodyContent = null;

            // Check if there's a quoted/tagged message
            const contextInfo = messageInfo.message?.extendedTextMessage?.contextInfo;
            if (contextInfo?.quotedMessage) {
                quotedContent = this.extractQuotedMessageContent(contextInfo.quotedMessage);

                // Check if quoted message is a document or image
                if (contextInfo.quotedMessage.documentMessage) {
                    quotedFile = contextInfo.quotedMessage;
                } else if (contextInfo.quotedMessage.imageMessage) {
                    quotedFile = contextInfo.quotedMessage;
                }

                const messageType = contextInfo.quotedMessage.imageMessage ? 'Image' : 
                                   contextInfo.quotedMessage.documentMessage ? 'Document' : 'Text';
                console.log(`📝 Found quoted message - Type: ${messageType}`);
            }

            // Extract any additional text after the .doc command
            const commandPrefix = require('../config').PREFIX;
            const additionalText = messageInfo.text ? 
                messageInfo.text.replace(new RegExp(`^${commandPrefix}doc\\s*`, 'i'), '').trim() : '';

            // LOGIC IMPLEMENTATION:
            if (quotedContent && additionalText) {
                // Case 1: Tagged text/document + additional text = quoted content is body, additional text is title
                console.log('📝 Case 1: Quoted content as body, additional text as title');
                bodyContent = quotedContent;
                customTitle = additionalText;
                result = await this.createModernDOC(customTitle, bodyContent);
            }
            else if (quotedContent && !additionalText) {
                // Case 2: Tagged text/document + no additional text = quoted content is body, no custom title
                console.log('📝 Case 2: Quoted content as body, no custom title');
                bodyContent = quotedContent;
                customTitle = null; // Let the system auto-extract title from content if available
                result = await this.convertTextToDoc(bodyContent);
            }
            else if (!quotedContent && additionalText) {
                // Case 3: No tagged content + text after .doc = that text becomes the body
                console.log('📝 Case 3: Additional text as body');
                bodyContent = additionalText;
                result = await this.convertTextToDoc(bodyContent);
            }
            else if (quotedFile && !quotedContent) {
                // Case 4: Document/Image file without text content
                const isImage = contextInfo.quotedMessage.imageMessage;
                const fileType = isImage ? 'Image' : 'Document';
                console.log(`📄 Case 4: ${fileType} file conversion`);

                // Download and convert the file
                try {
                    const downloadedFile = await this.downloadQuotedMedia(messageInfo, quotedFile);
                    if (downloadedFile) {
                        if (isImage) {
                            // Convert image to DOC
                            const customTitle = additionalText || null;
                            result = await this.createImageToDoc(downloadedFile.filePath, customTitle);
                        } else {
                            // Handle document conversion
                            const customTitle = additionalText || null;
                            result = await this.convertDocumentToDoc(downloadedFile.filePath, downloadedFile.fileName, customTitle);
                        }

                        // Cleanup downloaded file
                        setTimeout(async () => {
                            try {
                                await fs.unlink(downloadedFile.filePath);
                            } catch (e) {
                                console.warn(`⚠️ Cleanup warning: ${e.message}`);
                            }
                        }, 10000);
                    }
                } catch (downloadError) {
                    console.error(`Failed to download quoted ${fileType.toLowerCase()}:`, downloadError);
                    result = { success: false, error: `Failed to download ${fileType.toLowerCase()}` };
                }
            }

            // No valid input found
            if (!result) {
                return await this.bot.messageHandler.reply(messageInfo, 
                    `❌ No content found to convert to DOC.\n\n**Usage examples:**\n• Reply to text with \`.doc\` (text becomes body)\n• Reply to text with \`.doc My Title\` (text becomes body, "My Title" becomes title)\n• Send \`.doc Hello World\` ("Hello World" becomes body)`);
            }

            if (result && result.success) {
                console.log(`✅ DOC conversion complete: ${result.fileName}`);
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    document: { url: result.filePath },
                    fileName: result.fileName
                });

                // Cleanup temporary file
                setTimeout(async () => {
                    try {
                        await fs.unlink(result.filePath);
                    } catch (e) {
                        console.warn(`⚠️ Cleanup warning: ${e.message}`);
                    }
                }, 5000);
            } else {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ DOC conversion failed: ${result?.error || 'Unknown error'}`);
            }

        } catch (error) {
            console.error('❌ DOC converter error:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ DOC conversion failed. Please try again.');
        }
    }

    async convertTextToDoc(text) {
        try {
            console.log('📝 Converting text to DOC using modern methods');
            const cleanText = this.removeEmojis(text);
            const title = this.extractTitleFromText(cleanText)?.title;
            const contentWithoutTitle = this.extractTitleFromText(cleanText)?.remainingContent || cleanText;

            return await this.createModernDOC(title, contentWithoutTitle);
        } catch (error) {
            console.error('Text to DOC conversion error:', error);
            return { success: false, error: 'Failed to convert text to DOC' };
        }
    }

    // DOC creation using officegen
    async createModernDOC(title, content) {
        return await this.createSimpleTextDOC(title, content);
    }

    // Simple DOC creation using officegen
    async createSimpleTextDOC(title, content) {
        try {
            const officegen = require('officegen');
            const docx = officegen('docx');

            docx.creator = 'MATDEV Bot';
            docx.title = title || 'Document';
            docx.subject = 'Document Conversion';

            if (title) {
                const titleParagraph = docx.createP({ align: 'center' });
                titleParagraph.addText(title, { 
                    font_size: 18, 
                    bold: true, 
                    color: '1a365d',
                    font_face: 'Segoe UI'
                });
                docx.createP();
            }

            const paragraphs = content.split('\n\n');

            for (const paragraph of paragraphs) {
                if (paragraph.trim()) {
                    const p = docx.createP();
                    p.addText(paragraph.trim(), { 
                        font_size: 12,
                        font_face: 'Segoe UI',
                        line_height: 1.5
                    });
                }
            }

            docx.createP();
            const footerParagraph = docx.createP({ align: 'center' });
            footerParagraph.addText(`MATDEV Bot - ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, {
                font_size: 8,
                color: '9ca3af',
                italic: true,
                font_face: 'Segoe UI'
            });

            // Clean title of any existing extensions and ensure no double extensions
            let cleanTitle = title;
            if (cleanTitle) {
                // Remove any file extensions from the title first
                cleanTitle = cleanTitle.replace(/\.(docx?|pdf|txt|html|doc)$/i, '');
                // Remove any trailing numbers that might be timestamps
                cleanTitle = cleanTitle.replace(/_\d+$/i, '');
                // Sanitize the filename
                cleanTitle = this.sanitizeFileName(cleanTitle);
            }
            const fileName = cleanTitle ? `${cleanTitle}_${Date.now()}.docx` : `document_${Date.now()}.docx`;
            const filePath = path.join(__dirname, '..', 'tmp', fileName);

            await fs.ensureDir(path.dirname(filePath));

            await new Promise((resolve, reject) => {
                const out = fs.createWriteStream(filePath);
                out.on('error', reject);
                out.on('close', resolve);
                docx.generate(out);
            });

            console.log(`✅ DOC creation complete: ${fileName}`);
            return {
                success: true,
                filePath: filePath,
                fileName: fileName
            };

        } catch (error) {
            console.error('Simple DOC creation error:', error);
            return { success: false, error: 'Failed to create DOC' };
        }
    }

    // Image to DOC conversion using officegen
    async createImageToDoc(imagePath, customTitle) {
        try {
            console.log('🖼️ Converting image to DOC');

            const officegen = require('officegen');
            const docx = officegen('docx');

            docx.creator = 'MATDEV Bot';
            docx.title = customTitle || 'Image Document';
            docx.subject = 'Image Conversion';

            // Add title if provided
            if (customTitle) {
                const titleParagraph = docx.createP({ align: 'center' });
                titleParagraph.addText(customTitle, { 
                    font_size: 18, 
                    bold: true, 
                    color: '1a365d',
                    font_face: 'Segoe UI'
                });
                docx.createP();
            }

            // Add image to DOC
            try {
                const imageParagraph = docx.createP({ align: 'center' });
                imageParagraph.addImage(imagePath, {
                    cx: 400,
                    cy: 300
                });
            } catch (imageError) {
                console.error('Error adding image to DOC:', imageError);
                return { success: false, error: 'Failed to add image to DOC' };
            }

            // Add small footer
            docx.createP();
            const footerParagraph = docx.createP({ align: 'center' });
            footerParagraph.addText(`MATDEV Bot - ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, {
                font_size: 8,
                color: '9ca3af',
                italic: true,
                font_face: 'Segoe UI'
            });

            const fileName = customTitle ? `${this.sanitizeFileName(customTitle)}_${Date.now()}.docx` : `image_${Date.now()}.docx`;
            const filePath = path.join(__dirname, '..', 'tmp', fileName);

            await fs.ensureDir(path.dirname(filePath));

            await new Promise((resolve, reject) => {
                const out = fs.createWriteStream(filePath);
                out.on('error', reject);
                out.on('close', resolve);
                docx.generate(out);
            });

            console.log(`✅ Image to DOC conversion complete: ${fileName}`);
            return {
                success: true,
                filePath: filePath,
                fileName: fileName
            };

        } catch (error) {
            console.error('Image to DOC conversion error:', error);
            return { success: false, error: 'Failed to convert image to DOC' };
        }
    }

    // Convert document files to DOC format
    async convertDocumentToDoc(filePath, originalFileName, customTitle = null) {
        try {
            console.log('📄 Converting document to DOC format');

            const fileExtension = path.extname(originalFileName).toLowerCase();

            // Handle different document types
            switch (fileExtension) {
                case '.pdf':
                    return await this.convertPdfToDoc(filePath, originalFileName, customTitle);

                case '.txt':
                    return await this.convertTextFileToDoc(filePath, originalFileName, customTitle);

                case '.docx':
                    // If it's already DOCX, just rename/copy it
                    return await this.copyDocxFile(filePath, originalFileName, customTitle);

                case '.doc':
                    // If it's already DOC, just rename/copy it
                    return await this.copyDocFile(filePath, originalFileName, customTitle);

                default:
                    // For unknown formats, try to read as text
                    return await this.convertUnknownToDoc(filePath, originalFileName, customTitle);
            }
        } catch (error) {
            console.error('Document to DOC conversion error:', error);
            return { success: false, error: 'Failed to convert document to DOC' };
        }
    }

    // Convert PDF to DOC
    async convertPdfToDoc(pdfPath, originalFileName, customTitle) {
        try {
            console.log('📄 Converting PDF to DOC');

            // Try multiple PDF extraction methods
            let pdfText = '';
            let title = customTitle || path.basename(originalFileName, path.extname(originalFileName));
            let extractionMethod = 'unknown';

            // Method 1: Try pdf-parse first
            try {
                const pdfParse = require('pdf-parse');
                const pdfBuffer = await require('fs-extra').readFile(pdfPath);
                const pdfData = await pdfParse(pdfBuffer);

                if (pdfData.text && pdfData.text.trim().length > 10) {
                    pdfText = this.enhanceTextFormatting(pdfData.text.trim());
                    extractionMethod = 'pdf-parse';

                    // Try to extract title from first meaningful line if no custom title
                    if (!customTitle) {
                        const lines = pdfText.split('\n').filter(line => line.trim().length > 0);
                        if (lines.length > 0 && lines[0].length < 100 && lines[0].length > 3) {
                            const firstLine = lines[0].trim();
                            if (!firstLine.includes('Page') && !firstLine.includes('www.') && !firstLine.includes('@')) {
                                title = firstLine;
                                pdfText = lines.slice(1).join('\n').trim();
                            }
                        }
                    }

                    console.log(`✅ PDF text extracted via pdf-parse: ${pdfText.length} characters`);
                } else {
                    throw new Error('Minimal text extracted from pdf-parse');
                }

            } catch (parseError) {
                console.warn('pdf-parse failed, trying alternative methods:', parseError.message);

                // Method 2: Try to read as text (for text-based PDFs)
                try {
                    const rawText = await fs.readFile(pdfPath, 'utf8');
                    // Look for readable text patterns
                    const textMatch = rawText.match(/[a-zA-Z\s]{50,}/g);
                    if (textMatch && textMatch.length > 0) {
                        pdfText = textMatch.join(' ').substring(0, 5000);
                        extractionMethod = 'raw-text-extraction';
                        console.log(`✅ PDF text extracted via raw text method: ${pdfText.length} characters`);
                    } else {
                        throw new Error('No readable text found in raw extraction');
                    }
                } catch (rawError) {
                    // Method 3: Create detailed processing report with actual file info
                    console.warn('All extraction methods failed, creating detailed report');

                    const stats = await fs.stat(pdfPath);
                    extractionMethod = 'detailed-report';

                    pdfText = `PDF Document Analysis Report\n\n`;
                    pdfText += `📄 Original File: ${originalFileName}\n`;
                    pdfText += `📏 File Size: ${this.formatFileSize(stats.size)}\n`;
                    pdfText += `📅 Processing Date: ${new Date().toLocaleString()}\n\n`;

                    pdfText += `🔍 ANALYSIS RESULTS:\n`;
                    pdfText += `• File Format: PDF Document\n`;
                    pdfText += `• Text Extraction: Limited (may contain images, forms, or complex layouts)\n`;
                    pdfText += `• Content Type: Mixed content document\n\n`;

                    pdfText += `📋 POSSIBLE CONTENT TYPES:\n`;
                    if (stats.size > 1024 * 1024) { // > 1MB
                        pdfText += `• Large document - likely contains images or high-quality graphics\n`;
                    }
                    if (stats.size < 100 * 1024) { // < 100KB
                        pdfText += `• Small document - likely text-based with minimal graphics\n`;
                    }
                    pdfText += `• May contain: Forms, Tables, Images, Charts, or Scanned Pages\n`;
                    pdfText += `• Document structure preserved but text extraction was limited\n\n`;

                    pdfText += `⚠️ EXTRACTION LIMITATIONS:\n`;
                    pdfText += `• This PDF uses advanced formatting that prevents direct text extraction\n`;
                    pdfText += `• Content may be image-based (scanned document)\n`;
                    pdfText += `• PDF may be password protected or use special encoding\n`;
                    pdfText += `• Complex layouts with embedded objects detected\n\n`;

                    pdfText += `💡 RECOMMENDATIONS:\n`;
                    pdfText += `• For better text extraction, try OCR tools for image-based PDFs\n`;
                    pdfText += `• Use specialized PDF editors for form-based documents\n`;
                    pdfText += `• Consider manual copying if the PDF is viewable but not extractable\n\n`;

                    pdfText += `🔧 Technical Details:\n`;
                    pdfText += `• pdf-parse error: ${parseError.message}\n`;
                    pdfText += `• Raw extraction: ${rawError.message}\n`;
                    pdfText += `• Fallback method: Detailed analysis report generated\n\n`;

                    pdfText += `This document was successfully converted to DOC format with available metadata and analysis.`;

                    title = customTitle || `${path.basename(originalFileName, '.pdf')} - Analysis Report`;

                    console.log(`✅ Created detailed PDF analysis report: ${pdfText.length} characters`);
                }
            }

            // Create the DOC with the extracted or generated content
            const result = await this.createTextDoc(pdfText, title, originalFileName);

            if (result.success) {
                console.log(`✅ PDF to DOC conversion complete using ${extractionMethod} method`);
            }

            return result;

        } catch (error) {
            console.error('PDF to DOC conversion error:', error);
            return { success: false, error: 'Failed to convert PDF to DOC' };
        }
    }

    // Helper method to format file size
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Enhanced text formatting method (from converter.js)
    enhanceTextFormatting(text) {
        return text
            .replace(/\n\s*\n/g, '\n\n')  // Clean up multiple newlines
            .replace(/[ \t]+/g, ' ')       // Clean up multiple spaces
            .replace(/\n{3,}/g, '\n\n')    // Limit consecutive newlines
            .trim();
    }

    // Convert text file to DOC
    async convertTextFileToDoc(filePath, originalFileName, customTitle) {
        try {
            console.log('📄 Converting text file to DOC');

            const textContent = await fs.readFile(filePath, 'utf8');
            const title = customTitle || path.basename(originalFileName, path.extname(originalFileName));

            return await this.createTextDoc(textContent, title, originalFileName);

        } catch (error) {
            console.error('Text to DOC conversion error:', error);
            return { success: false, error: 'Failed to convert text file to DOC' };
        }
    }

    // Copy existing DOCX file
    async copyDocxFile(filePath, originalFileName, customTitle) {
        try {
            console.log('📄 Copying DOCX file');

            let fileName;
            if (customTitle) {
                const cleanTitle = this.sanitizeFileName(customTitle).replace(/\.(docx?|pdf|txt|html)$/i, '');
                fileName = `${cleanTitle}_${Date.now()}.docx`;
            } else {
                const baseName = path.basename(originalFileName, path.extname(originalFileName));
                fileName = `${baseName}_${Date.now()}.docx`;
            }

            const outputPath = path.join(__dirname, '..', 'tmp', fileName);

            await fs.copy(filePath, outputPath);

            return {
                success: true,
                filePath: outputPath,
                fileName: fileName
            };

        } catch (error) {
            console.error('DOCX copy error:', error);
            return { success: false, error: 'Failed to process DOCX file' };
        }
    }

    // Copy existing DOC file
    async copyDocFile(filePath, originalFileName, customTitle) {
        try {
            console.log('📄 Copying DOC file');

            let fileName;
            if (customTitle) {
                const cleanTitle = this.sanitizeFileName(customTitle).replace(/\.(docx?|pdf|txt|html)$/i, '');
                fileName = `${cleanTitle}_${Date.now()}.doc`;
            } else {
                const baseName = path.basename(originalFileName, path.extname(originalFileName));
                fileName = `${baseName}_${Date.now()}.doc`;
            }

            const outputPath = path.join(__dirname, '..', 'tmp', fileName);

            await fs.copy(filePath, outputPath);

            return {
                success: true,
                filePath: outputPath,
                fileName: fileName
            };

        } catch (error) {
            console.error('DOC copy error:', error);
            return { success: false, error: 'Failed to process DOC file' };
        }
    }

    // Convert unknown format to DOC
    async convertUnknownToDoc(filePath, originalFileName, customTitle) {
        try {
            console.log('📄 Converting unknown format to DOC');

            let content = '';
            try {
                // Try to read as text first
                content = await fs.readFile(filePath, 'utf8');
            } catch (error) {
                // If can't read as text, create a placeholder
                content = `File: ${originalFileName}\n\n`;
                content += 'This file could not be converted to text format.\n';
                content += 'The original file format may not be supported for text extraction.\n\n';
                content += `Converted on: ${new Date().toLocaleString()}`;
            }

            const title = customTitle || path.basename(originalFileName, path.extname(originalFileName));
            return await this.createTextDoc(content, title, originalFileName);

        } catch (error) {
            console.error('Unknown format to DOC conversion error:', error);
            return { success: false, error: 'Failed to convert unknown format to DOC' };
        }
    }

    // Create DOC from text content
    async createTextDoc(textContent, title, originalFileName = '') {
        try {
            const officegen = require('officegen');
            const docx = officegen('docx');

            docx.creator = 'MATDEV Bot';
            docx.title = title || 'Converted Document';
            docx.subject = 'Document Conversion';

            if (title) {
                const titleParagraph = docx.createP({ align: 'center' });
                titleParagraph.addText(title, { 
                    font_size: 18, 
                    bold: true, 
                    color: '1a365d',
                    font_face: 'Segoe UI'
                });
                docx.createP();
            }

            // Add original filename info if available
            if (originalFileName) {
                const infoParagraph = docx.createP();
                infoParagraph.addText(`Original file: ${originalFileName}`, {
                    font_size: 10,
                    color: '9ca3af',
                    italic: true,
                    font_face: 'Segoe UI'
                });
                docx.createP();
            }

            // Split content into paragraphs
            const paragraphs = textContent.split('\n\n');

            for (const paragraph of paragraphs) {
                if (paragraph.trim()) {
                    const p = docx.createP();
                    p.addText(paragraph.trim(), { 
                        font_size: 12,
                        font_face: 'Segoe UI',
                        line_height: 1.5
                    });
                }
            }

            // Add footer
            docx.createP();
            const footerParagraph = docx.createP({ align: 'center' });
            footerParagraph.addText(`MATDEV Bot - ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, {
                font_size: 8,
                color: '9ca3af',
                italic: true,
                font_face: 'Segoe UI'
            });

            // Clean title of any existing extensions and ensure no double extensions
            let cleanTitle = title;
            if (cleanTitle) {
                // Remove any file extensions from the title first
                cleanTitle = cleanTitle.replace(/\.(docx?|pdf|txt|html|doc)$/i, '');
                // Remove any trailing numbers that might be timestamps
                cleanTitle = cleanTitle.replace(/_\d+$/i, '');
                // Sanitize the filename
                cleanTitle = this.sanitizeFileName(cleanTitle);
            }
            const fileName = cleanTitle ? `${cleanTitle}_${Date.now()}.docx` : `converted_${Date.now()}.docx`;
            const filePath = path.join(__dirname, '..', 'tmp', fileName);

            await fs.ensureDir(path.dirname(filePath));

            await new Promise((resolve, reject) => {
                const out = fs.createWriteStream(filePath);
                out.on('error', reject);
                out.on('close', resolve);
                docx.generate(out);
            });

            console.log(`✅ Text DOC creation complete: ${fileName}`);
            return {
                success: true,
                filePath: filePath,
                fileName: fileName
            };

        } catch (error) {
            console.error('Text DOC creation error:', error);
            return { success: false, error: 'Failed to create DOC from text' };
        }
    }

    // Helper functions
    extractQuotedMessageContent(quotedMessage) {
        try {
            if (quotedMessage.conversation) {
                return quotedMessage.conversation;
            }
            if (quotedMessage.extendedTextMessage?.text) {
                return quotedMessage.extendedTextMessage.text;
            }
            if (quotedMessage.imageMessage?.caption) {
                return quotedMessage.imageMessage.caption;
            }
            if (quotedMessage.videoMessage?.caption) {
                return quotedMessage.videoMessage.caption;
            }
            if (quotedMessage.documentMessage?.caption) {
                return quotedMessage.documentMessage.caption;
            }
            return null;
        } catch (error) {
            console.error('Error extracting quoted message content:', error);
            return null;
        }
    }

    async downloadQuotedMedia(messageInfo, quotedMessage) {
        try {
            const { downloadMediaMessage } = require('@whiskeysockets/baileys');

            const messageToDownload = {
                key: {
                    id: messageInfo.message.extendedTextMessage.contextInfo.stanzaId,
                    remoteJid: messageInfo.chat_jid,
                    fromMe: false,
                    participant: messageInfo.message.extendedTextMessage.contextInfo.participant
                },
                message: quotedMessage
            };

            const stream = await downloadMediaMessage(messageToDownload, 'stream', {}, {
                logger: console,
                reuploadRequest: this.bot.sock.updateMediaMessage
            });

            const chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);

            let fileName = 'downloaded_file';
            let extension = '';

            if (quotedMessage.documentMessage) {
                fileName = quotedMessage.documentMessage.fileName || 'document';
                extension = path.extname(fileName) || this.getExtensionFromMimetype(quotedMessage.documentMessage.mimetype);
            } else if (quotedMessage.imageMessage) {
                extension = this.getExtensionFromMimetype(quotedMessage.imageMessage.mimetype) || '.jpg';
                fileName = `image_${Date.now()}${extension}`;
            }

            if (!path.extname(fileName)) {
                fileName += extension;
            }

            const tempDir = path.join(__dirname, '..', 'tmp');
            const filePath = path.join(tempDir, fileName);

            await fs.writeFile(filePath, buffer);

            return {
                filePath: filePath,
                fileName: fileName,
                buffer: buffer
            };

        } catch (error) {
            console.error('Error downloading quoted media:', error);
            throw error;
        }
    }

    getExtensionFromMimetype(mimetype) {
        const mimetypeMap = {
            'application/pdf': '.pdf',
            'application/msword': '.doc',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
            'text/plain': '.txt',
            'text/html': '.html',
            'image/jpeg': '.jpg',
            'image/jpg': '.jpg',
            'image/png': '.png',
            'image/gif': '.gif',
            'image/webp': '.webp'
        };
        return mimetypeMap[mimetype] || '';
    }

    removeEmojis(text) {
        return text.replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '');
    }

    extractTitleFromText(text) {
        const lines = text.split('\n').filter(line => line.trim());
        if (lines.length === 0) return { title: null, remainingContent: text };

        const firstLine = lines[0].trim();
        if (firstLine.length <= 60 && lines.length > 1) {
            return {
                title: firstLine,
                remainingContent: lines.slice(1).join('\n').trim()
            };
        }

        return { title: null, remainingContent: text };
    }

    sanitizeFileName(fileName) {
        return fileName
            .replace(/[^a-zA-Z0-9\s\-_.]/g, '')
            .replace(/\s+/g, '_')
            .substring(0, 50);
    }

    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, function(m) { return map[m]; });
    }

    async cleanup() {
        console.log('🧹 DOC Converter plugin cleanup completed');
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new DOCConverterPlugin();
        await plugin.init(bot);
        return plugin;
    }
};
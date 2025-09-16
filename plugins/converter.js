const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const sharp = require('sharp');
const config = require('../config');

class ConverterPlugin {
    constructor() {
        this.name = 'converter';
        this.description = 'Convert between various file formats (PDF, DOC, images, text)';
        this.version = '2.0.0';
        this.enabled = true;
        this.supportedFormats = {
            input: ['text', 'pdf', 'doc', 'docx', 'html', 'image'],
            output: ['pdf', 'doc', 'docx', 'txt', 'html', 'png', 'jpg', 'jpeg']
        };
    }

    async init(bot) {
        this.bot = bot;
        try {
            // Register simple format-based commands that auto-detect input
            const outputFormats = ['pdf', 'doc', 'docx', 'txt', 'html', 'png', 'jpg', 'jpeg', 'img'];
            
            for (const format of outputFormats) {
                this.bot.messageHandler.registerCommand(format, (messageInfo) => this.autoConvertCommand(format, messageInfo), {
                    description: `Convert any file/text to ${format.toUpperCase()}`,
                    usage: `${config.PREFIX}${format} - Send file or reply to message/file`,
                    category: 'utility',
                    plugin: 'converter',
                    source: 'converter.js'
                });
            }

            this.bot.messageHandler.registerCommand('formats', this.listFormatsCommand.bind(this), {
                description: 'List all supported conversion formats',
                usage: `${config.PREFIX}formats`,
                category: 'utility',
                plugin: 'converter',
                source: 'converter.js'
            });

            console.log('✅ Smart Auto-Converter plugin loaded');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Converter plugin:', error);
            return false;
        }
    }

    async listFormatsCommand(messageInfo) {
        const formatsList = `📋 **Smart Auto-Converter**

**How to Use:**
Just tag any document/text and use the target format command!

**Available Commands:**
• \`${config.PREFIX}pdf\` - Convert to PDF
• \`${config.PREFIX}doc\` - Convert to DOC
• \`${config.PREFIX}docx\` - Convert to DOCX
• \`${config.PREFIX}txt\` - Convert to text
• \`${config.PREFIX}html\` - Convert to HTML
• \`${config.PREFIX}png\` - Convert to PNG image
• \`${config.PREFIX}jpg\` - Convert to JPG image
• \`${config.PREFIX}img\` - Convert to image

**Examples:**
• Send a Word doc → \`${config.PREFIX}pdf\`
• Send a PDF → \`${config.PREFIX}img\`
• Reply to text message → \`${config.PREFIX}pdf\`
• Send any image → \`${config.PREFIX}jpg\`

**Auto-Detects:** TEXT, PDF, DOC, DOCX, HTML, Images`;

        await this.bot.messageHandler.reply(messageInfo, formatsList);
    }

    async autoConvertCommand(targetFormat, messageInfo) {
        try {
            // Normalize target format
            if (targetFormat === 'img') targetFormat = 'png';
            
            // Clean converter - no debug logging needed

            // Check for quoted message first (like compress.js does)
            const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                messageInfo.message?.quotedMessage;

            // Check for text content (either command args or quoted message)
            let textContent = '';
            if (quotedMessage) {
                if (quotedMessage.conversation) {
                    textContent = quotedMessage.conversation;
                } else if (quotedMessage.extendedTextMessage?.text) {
                    textContent = quotedMessage.extendedTextMessage.text;
                }
            } else if (messageInfo.args.length > 0) {
                textContent = messageInfo.args.join(' ').trim();
            }

            // Auto-detect input type and process
            let inputFormat = 'unknown';
            let filePath = null;
            let fileMessage = null;

            // Check for direct file attachments FIRST (this is what user is sending)
            if (messageInfo.message?.documentMessage) {
                fileMessage = messageInfo.message.documentMessage;
                inputFormat = this.detectFileFormat(fileMessage);
                console.log('🔍 Found direct document:', { fileName: fileMessage.fileName, mimetype: fileMessage.mimetype, detectedFormat: inputFormat });
            } else if (messageInfo.message?.imageMessage) {
                fileMessage = messageInfo.message.imageMessage;
                inputFormat = 'image';
                console.log('🔍 Found direct image');
            } else if (messageInfo.message?.videoMessage) {
                fileMessage = messageInfo.message.videoMessage;
                inputFormat = 'video';
                console.log('🔍 Found direct video');
            }
            
            // If no direct attachment, check for quoted message
            if (!fileMessage && quotedMessage) {
                
                if (quotedMessage.documentMessage) {
                    fileMessage = quotedMessage.documentMessage;
                    inputFormat = this.detectFileFormat(fileMessage);
                    console.log('🔍 Found quoted document:', { fileName: fileMessage.fileName, mimetype: fileMessage.mimetype, detectedFormat: inputFormat });
                } else if (quotedMessage.documentWithCaptionMessage) {
                    // Handle documents sent with captions (PDF with .doc caption)
                    fileMessage = quotedMessage.documentWithCaptionMessage.message?.documentMessage;
                    if (fileMessage) {
                        inputFormat = this.detectFileFormat(fileMessage);
                    }
                } else if (quotedMessage.imageMessage) {
                    fileMessage = quotedMessage.imageMessage;
                    inputFormat = 'image';
                    console.log('🔍 Found quoted image');
                } else if (quotedMessage.videoMessage) {
                    fileMessage = quotedMessage.videoMessage;
                    inputFormat = 'video';
                    console.log('🔍 Found quoted video');
                }
            }

            // Check if this is a document sent with caption in context (different structure)
            if (!fileMessage && messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
                const contextQuoted = messageInfo.message.extendedTextMessage.contextInfo.quotedMessage;
                
                if (contextQuoted.documentMessage) {
                    fileMessage = contextQuoted.documentMessage;
                    inputFormat = this.detectFileFormat(fileMessage);
                    console.log('🔍 Found context quoted document:', { fileName: fileMessage.fileName, mimetype: fileMessage.mimetype, detectedFormat: inputFormat });
                } else if (contextQuoted.documentWithCaptionMessage) {
                    // Handle documents sent with captions
                    fileMessage = contextQuoted.documentWithCaptionMessage.message?.documentMessage;
                    if (fileMessage) {
                        inputFormat = this.detectFileFormat(fileMessage);
                    }
                } else if (contextQuoted.imageMessage) {
                    fileMessage = contextQuoted.imageMessage;
                    inputFormat = 'image';
                    console.log('🔍 Found context quoted image');
                } else if (contextQuoted.videoMessage) {
                    fileMessage = contextQuoted.videoMessage;
                    inputFormat = 'video';
                    console.log('🔍 Found context quoted video');
                }
            }

            if (fileMessage) {
                if (inputFormat === 'unknown') {
                    await this.bot.messageHandler.reply(messageInfo, 
                        `❌ Unsupported file format for ${targetFormat.toUpperCase()} conversion.\n\n` +
                        `📁 **Supported formats:** PDF, DOC, DOCX, Images, HTML, Text`);
                    return;
                }
                // For documentWithCaptionMessage, we need to pass the full quoted message structure
                const downloadType = quotedMessage ? 'quoted' : 'direct';
                const fullMessageForDownload = quotedMessage ? quotedMessage : { documentMessage: fileMessage };
                filePath = await this.downloadFileRobust(fileMessage, downloadType, fullMessageForDownload);
            } else if (textContent) {
                inputFormat = 'text';
            } else {
                // Show helpful usage message
                await this.bot.messageHandler.reply(messageInfo,
                    `📁 **Convert to ${targetFormat.toUpperCase()}**\n\n` +
                    `Send a file or text, or reply to a message/file with \`${config.PREFIX}${targetFormat}\`\n\n` +
                    `**Supported inputs:** Text, PDF, DOC, DOCX, Images, HTML`);
                return;
            }

            // Convert based on input and target formats (silent)
            const result = await this.performConversion(inputFormat, targetFormat, filePath, textContent, messageInfo);
            
            if (result.success) {
                if (targetFormat === 'png' || targetFormat === 'jpg' || targetFormat === 'jpeg') {
                    // Send as image (no caption)
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        image: { url: result.filePath }
                    });
                } else {
                    // Send as document (no caption)
                    const mimeTypes = {
                        'pdf': 'application/pdf',
                        'doc': 'application/msword',
                        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                        'txt': 'text/plain',
                        'html': 'text/html'
                    };

                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        document: { url: result.filePath },
                        fileName: result.fileName,
                        mimetype: mimeTypes[targetFormat] || 'application/octet-stream'
                    });
                }
                
                // Clean up temp files
                await fs.unlink(result.filePath).catch(() => {});
                if (filePath) await fs.unlink(filePath).catch(() => {});
            } else {
                // Silent failure - no error message to user
                console.error(`Conversion failed: ${result.error}`);
            }

        } catch (error) {
            // Silent failure - only log error, no user message
            console.error(`Error in ${targetFormat} conversion:`, error);
        }
    }

    detectFileFormat(fileMessage) {
        const mimetype = fileMessage.mimetype || '';
        const fileName = fileMessage.fileName || '';
        
        // PDF files
        if (mimetype.includes('pdf') || fileName.toLowerCase().endsWith('.pdf')) {
            return 'pdf';
        }
        
        // Word documents
        if (mimetype.includes('msword') || mimetype.includes('wordprocessingml') ||
            fileName.toLowerCase().endsWith('.doc') || fileName.toLowerCase().endsWith('.docx')) {
            return fileName.toLowerCase().endsWith('.docx') ? 'docx' : 'doc';
        }
        
        // Images
        if (mimetype.startsWith('image/') || 
            /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(fileName)) {
            return 'image';
        }
        
        // HTML files
        if (mimetype.includes('html') || fileName.toLowerCase().endsWith('.html')) {
            return 'html';
        }
        
        // Text files
        if (mimetype.includes('text') || fileName.toLowerCase().endsWith('.txt')) {
            return 'text';
        }
        
        return 'unknown';
    }

    async performConversion(inputFormat, targetFormat, filePath, textContent, messageInfo) {
        try {
            // Handle text input conversions
            if (inputFormat === 'text') {
                if (targetFormat === 'pdf') {
                    return await this.createPDF('Generated Document', textContent);
                } else if (targetFormat === 'txt') {
                    return await this.createTextFile(textContent);
                } else if (targetFormat === 'html') {
                    return await this.createHTMLFile('Generated HTML', textContent);
                }
            }
            
            // Handle file-based conversions
            if (filePath) {
                if (inputFormat === 'pdf' && (targetFormat === 'png' || targetFormat === 'jpg' || targetFormat === 'jpeg')) {
                    const pageNumber = messageInfo.args[0] ? parseInt(messageInfo.args[0]) : 1;
                    return await this.convertPdfToImageSimple(filePath, pageNumber);
                } else if (inputFormat === 'pdf' && (targetFormat === 'doc' || targetFormat === 'docx')) {
                    return await this.convertPdfToDoc(filePath);
                } else if ((inputFormat === 'doc' || inputFormat === 'docx') && targetFormat === 'pdf') {
                    return await this.convertDocToPdf(filePath);
                } else if (inputFormat === 'image' && targetFormat === 'pdf') {
                    return await this.convertImageToPdf(filePath);
                } else if (inputFormat === 'image' && (targetFormat === 'png' || targetFormat === 'jpg' || targetFormat === 'jpeg')) {
                    return await this.convertImageFormat(filePath, targetFormat);
                }
            }

            return {
                success: false,
                error: `Conversion from ${inputFormat.toUpperCase()} to ${targetFormat.toUpperCase()} not supported yet`
            };

        } catch (error) {
            console.error('Conversion error:', error);
            return {
                success: false,
                error: 'Conversion failed'
            };
        }
    }

    async createTextFile(content) {
        try {
            const fileName = `text_${Date.now()}.txt`;
            const filePath = path.join(__dirname, '..', 'tmp', fileName);
            
            await fs.ensureDir(path.dirname(filePath));
            await fs.writeFile(filePath, content, 'utf8');
            
            return {
                success: true,
                filePath: filePath,
                fileName: fileName
            };
        } catch (error) {
            console.error('Text file creation error:', error);
            return {
                success: false,
                error: 'Failed to create text file'
            };
        }
    }

    async createHTMLFile(title, content) {
        try {
            const fileName = `html_${Date.now()}.html`;
            const filePath = path.join(__dirname, '..', 'tmp', fileName);
            
            const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
        h1 { color: #333; }
        p { margin-bottom: 15px; }
    </style>
</head>
<body>
    <h1>${title}</h1>
    <div>${content.replace(/\n/g, '<br>')}</div>
</body>
</html>`;
            
            await fs.ensureDir(path.dirname(filePath));
            await fs.writeFile(filePath, html, 'utf8');
            
            return {
                success: true,
                filePath: filePath,
                fileName: fileName
            };
        } catch (error) {
            console.error('HTML file creation error:', error);
            return {
                success: false,
                error: 'Failed to create HTML file'
            };
        }
    }

    async convertImageToPdf(imagePath) {
        try {
            const fileName = `image_to_pdf_${Date.now()}.pdf`;
            const filePath = path.join(__dirname, '..', 'tmp', fileName);
            
            // Use PDFKit to create PDF from image
            const PDFDocument = require('pdfkit');
            const doc = new PDFDocument();
            const stream = fs.createWriteStream(filePath);
            doc.pipe(stream);
            
            // Add image to PDF
            doc.image(imagePath, 50, 50, {
                fit: [500, 700],
                align: 'center',
                valign: 'center'
            });
            
            doc.end();
            
            // Wait for the stream to finish
            await new Promise((resolve, reject) => {
                stream.on('finish', resolve);
                stream.on('error', reject);
            });
            
            return {
                success: true,
                filePath: filePath,
                fileName: fileName
            };
        } catch (error) {
            console.error('Image to PDF conversion error:', error);
            return {
                success: false,
                error: 'Failed to convert image to PDF'
            };
        }
    }

    async convertImageFormat(imagePath, targetFormat) {
        try {
            const fileName = `converted_${Date.now()}.${targetFormat}`;
            const filePath = path.join(__dirname, '..', 'tmp', fileName);
            
            await fs.ensureDir(path.dirname(filePath));
            
            // Use sharp to convert image format
            await sharp(imagePath)
                .toFormat(targetFormat)
                .toFile(filePath);
            
            return {
                success: true,
                filePath: filePath,
                fileName: fileName
            };
        } catch (error) {
            console.error('Image format conversion error:', error);
            return {
                success: false,
                error: 'Failed to convert image format'
            };
        }
    }

    async convertPdfToImageSimple(pdfPath, pageNumber) {
        try {
            const fileName = `pdf_page_${pageNumber}_${Date.now()}.png`;
            const outputDir = path.join(__dirname, '..', 'tmp');
            
            await fs.ensureDir(outputDir);
            
            // Check if pdf-poppler is supported on this platform
            try {
                const poppler = require('pdf-poppler');
                
                const options = {
                    format: 'png',
                    out_dir: outputDir,
                    out_prefix: `pdf_page_${pageNumber}_${Date.now()}`,
                    page: pageNumber
                };

                const outputFiles = await poppler.convert(pdfPath, options);
                
                if (outputFiles && outputFiles.length > 0) {
                    const generatedFile = outputFiles[0];
                    
                    return {
                        success: true,
                        filePath: generatedFile,
                        fileName: path.basename(generatedFile)
                    };
                }
            } catch (popplerError) {
                console.warn('pdf-poppler not supported on this platform, using fallback method');
                // Continue to fallback method
            }

            // Use fallback method
            return await this.pdfToImageFallback(pdfPath, pageNumber);

        } catch (error) {
            console.error('PDF to image conversion error:', error);
            // Try fallback method
            return await this.pdfToImageFallback(pdfPath, pageNumber);
        }
    }

    async createPDF(title, content) {
        try {
            // Create a simple HTML structure for PDF conversion
            const html = this.generateHTML(title, content);

            // Try to use free HTML to PDF service (placeholder for now)
            const pdfResult = await this.htmlToPDF(html, title);

            if (pdfResult.success) {
                return pdfResult;
            }

            // Fallback: Create a simple text-based PDF using basic formatting
            return await this.createTextPDF(title, content);

        } catch (error) {
            console.error('PDF creation error:', error);
            return {
                success: false,
                error: 'PDF generation service temporarily unavailable'
            };
        }
    }

    generateHTML(title, content) {
        // Format content with proper paragraphs
        const formattedContent = content.split('\n').map(line =>
            line.trim() ? `<p>${line.trim()}</p>` : '<br>'
        ).join('');

        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>${title}</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
                h1 { color: #333; border-bottom: 2px solid #007acc; padding-bottom: 10px; }
                p { margin-bottom: 15px; text-align: justify; }
                .footer { margin-top: 50px; font-size: 12px; color: #666; text-align: center; }
            </style>
        </head>
        <body>
            <h1>${title}</h1>
            ${formattedContent}
            <div class="footer">Generated by MATDEV Bot on ${new Date().toLocaleString()}</div>
        </body>
        </html>`;
    }

    async htmlToPDF(html, title) {
        try {
            // Try HTML-PDF conversion API
            const response = await axios.post('https://api.html-pdf-api.com/v1/generate', {
                html: html,
                options: {
                    format: 'A4',
                    margin: {
                        top: '1in',
                        bottom: '1in',
                        left: '0.5in',
                        right: '0.5in'
                    }
                }
            }, {
                timeout: 10000,
                responseType: 'arraybuffer',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.data) {
                const fileName = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.pdf`;
                const filePath = path.join(__dirname, '..', 'tmp', fileName);

                await fs.ensureDir(path.dirname(filePath));
                await fs.writeFile(filePath, response.data);

                return {
                    success: true,
                    filePath: filePath,
                    fileName: fileName
                };
            }

            return { success: false };

        } catch (error) {
            console.error('HTML to PDF error:', error);
            // Try alternative API
            return await this.tryAlternativePDFAPI(html, title);
        }
    }

    async tryAlternativePDFAPI(html, title) {
        try {
            // Try a different PDF generation approach using PDFShift API
            const response = await axios.post('https://api.pdfshift.io/v3/convert/pdf', {
                source: html,
                landscape: false,
                format: 'A4'
            }, {
                timeout: 10000,
                responseType: 'arraybuffer',
                headers: {
                    'Authorization': 'Basic ' + Buffer.from('api:').toString('base64'),
                    'Content-Type': 'application/json'
                }
            });

            if (response.data) {
                const fileName = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.pdf`;
                const filePath = path.join(__dirname, '..', 'tmp', fileName);

                await fs.ensureDir(path.dirname(filePath));
                await fs.writeFile(filePath, response.data);

                return {
                    success: true,
                    filePath: filePath,
                    fileName: fileName
                };
            }

            return { success: false };

        } catch (error) {
            console.error('Alternative PDF API error:', error);
            return { success: false };
        }
    }

    async createTextPDF(title, content) {
        try {
            // Create a simple PDF using a basic PDF structure
            const fileName = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.pdf`;
            const filePath = path.join(__dirname, '..', 'tmp', fileName);

            await fs.ensureDir(path.dirname(filePath));

            // Try to use a simple HTML to PDF approach with basic CSS
            const simplePDFHTML = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        @page { margin: 2cm; }
        body { font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.5; }
        h1 { font-size: 18pt; margin-bottom: 20px; text-align: center; }
        .content { text-align: justify; margin-bottom: 30px; }
        .footer { font-size: 10pt; color: #666; text-align: center; position: fixed; bottom: 1cm; }
    </style>
</head>
<body>
    <h1>${title}</h1>
    <div class="content">${content.replace(/\n/g, '<br>')}</div>
    <div class="footer">Generated by MATDEV Bot - ${new Date().toLocaleString()}</div>
</body>
</html>`;

            // Try one more lightweight conversion approach
            try {
                const pdfResponse = await axios.post('https://htmlpdfapi.com/api/v1/pdf', {
                    html: simplePDFHTML,
                    options: { format: 'A4', margin: '1cm' }
                }, {
                    timeout: 8000,
                    responseType: 'arraybuffer',
                    headers: { 'Content-Type': 'application/json' }
                });

                if (pdfResponse.data) {
                    await fs.writeFile(filePath, pdfResponse.data);
                    return {
                        success: true,
                        filePath: filePath,
                        fileName: fileName
                    };
                }
            } catch (e) {
                }

            // Ultimate fallback: Create a real PDF using PDFKit
            const PDFDocument = require('pdfkit');
            const doc = new PDFDocument({
                margin: 50,
                font: 'Helvetica'
            });
            
            // Create write stream
            const stream = fs.createWriteStream(filePath);
            doc.pipe(stream);
            
            // Add title
            doc.fontSize(20)
               .fillColor('#333333')
               .text(title, 50, 50);
            
            // Add underline
            doc.moveTo(50, 80)
               .lineTo(550, 80)
               .strokeColor('#007acc')
               .lineWidth(2)
               .stroke();
            
            // Add content
            doc.fontSize(12)
               .fillColor('#000000')
               .text(content, 50, 110, {
                   width: 500,
                   align: 'justify',
                   lineGap: 5
               });
            
            // Add footer
            const pageHeight = doc.page.height;
            doc.fontSize(10)
               .fillColor('#666666')
               .text(`Generated by MATDEV Bot on ${new Date().toLocaleString()}`, 50, pageHeight - 50, {
                   align: 'center'
               });
            
            // Finalize the PDF
            doc.end();
            
            // Wait for the stream to finish
            await new Promise((resolve, reject) => {
                stream.on('finish', resolve);
                stream.on('error', reject);
            });
            
            return {
                success: true,
                filePath: filePath,
                fileName: fileName
            };

        } catch (error) {
            console.error('Text PDF creation error:', error);
            return {
                success: false,
                error: 'Failed to create document file'
            };
        }
    }

    async pdfToImageCommand(messageInfo) {
        try {
            const pageNumber = messageInfo.args[0] ? parseInt(messageInfo.args[0]) : 1;
            
            // Check for file in message or quoted message
            const fileMessage = messageInfo.message?.documentMessage || 
                              messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage?.documentMessage;
            
            if (!fileMessage || fileMessage.mimetype !== 'application/pdf') {
                await this.bot.messageHandler.reply(messageInfo, 
                    '📄 Please send a PDF file or reply to a PDF with this command.\n\n' +
                    `Usage: \`${config.PREFIX}pdftoimg [page_number]\`\n` +
                    'Example: `.pdftoimg 2` (converts page 2 to image)');
                return;
            }

            await this.bot.messageHandler.reply(messageInfo, '🔄 Converting PDF to image...');

            const result = await this.convertPdfToImage(fileMessage, pageNumber);
            
            if (result.success) {
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    image: { url: result.filePath },
                    caption: `📸 PDF Page ${pageNumber} converted to image`
                });
                
                // Clean up temp file
                await fs.unlink(result.filePath).catch(() => {});
            } else {
                await this.bot.messageHandler.reply(messageInfo, `❌ ${result.error}`);
            }

        } catch (error) {
            console.error('Error in pdftoimg command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error converting PDF to image.');
        }
    }

    async universalConvertCommand(messageInfo) {
        try {
            if (messageInfo.args.length < 2) {
                await this.bot.messageHandler.reply(messageInfo,
                    '🔧 **Universal Converter**\n\n' +
                    `Usage: \`${config.PREFIX}convert <from_format> <to_format>\`\n\n` +
                    'Then send the file you want to convert.\n\n' +
                    'Examples:\n' +
                    '• `.convert pdf png` (then send PDF)\n' +
                    '• `.convert doc pdf` (then send DOC)\n' +
                    '• `.convert image pdf` (then send image)\n\n' +
                    `Type \`${config.PREFIX}formats\` to see all supported formats.`);
                return;
            }

            const fromFormat = messageInfo.args[0].toLowerCase();
            const toFormat = messageInfo.args[1].toLowerCase();

            if (!this.supportedFormats.input.includes(fromFormat)) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Unsupported input format: ${fromFormat}\n` +
                    `Supported: ${this.supportedFormats.input.join(', ')}`);
                return;
            }

            if (!this.supportedFormats.output.includes(toFormat)) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Unsupported output format: ${toFormat}\n` +
                    `Supported: ${this.supportedFormats.output.join(', ')}`);
                return;
            }

            // Store conversion request (you might want to implement a cache/session system)
            await this.bot.messageHandler.reply(messageInfo, 
                `✅ Conversion set: ${fromFormat.toUpperCase()} → ${toFormat.toUpperCase()}\n\n` +
                '📎 Now send the file you want to convert or reply to a file with this command.');

        } catch (error) {
            console.error('Error in convert command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error setting up conversion.');
        }
    }

    async convertPdfToImage(fileMessage, pageNumber = 1) {
        try {
            // Download PDF file
            const pdfPath = await this.downloadFile(fileMessage);
            
            // Use API to convert PDF to image
            const imageResult = await this.pdfToImageAPI(pdfPath, pageNumber);
            
            if (imageResult.success) {
                // Clean up PDF file
                await fs.unlink(pdfPath).catch(() => {});
                return imageResult;
            }

            // Fallback: Try alternative methods
            return await this.pdfToImageFallback(pdfPath, pageNumber);

        } catch (error) {
            console.error('PDF to image conversion error:', error);
            return {
                success: false,
                error: 'Failed to convert PDF to image'
            };
        }
    }

    async pdfToImageAPI(pdfPath, pageNumber) {
        try {
            // Try using PDF-lib or similar API for conversion
            const formData = new (require('form-data'))();
            formData.append('file', fs.createReadStream(pdfPath));
            formData.append('page', pageNumber.toString());
            formData.append('format', 'png');

            const response = await axios.post('https://api.convertapi.com/convert/pdf/to/png', formData, {
                headers: {
                    ...formData.getHeaders(),
                },
                timeout: 15000,
                responseType: 'arraybuffer'
            });

            if (response.data) {
                const fileName = `pdf_page_${pageNumber}_${Date.now()}.png`;
                const filePath = path.join(__dirname, '..', 'tmp', fileName);
                
                await fs.ensureDir(path.dirname(filePath));
                await fs.writeFile(filePath, response.data);

                return {
                    success: true,
                    filePath: filePath,
                    fileName: fileName
                };
            }

            return { success: false };

        } catch (error) {
            console.error('PDF to image API error:', error);
            return { success: false };
        }
    }

    async pdfToImageFallback(pdfPath, pageNumber) {
        try {
            // Try using pdf-parse to extract text and create an image representation
            const fileName = `fallback_pdf_page_${pageNumber}_${Date.now()}.png`;
            const outputDir = path.join(__dirname, '..', 'tmp');
            const filePath = path.join(outputDir, fileName);
            
            await fs.ensureDir(outputDir);
            
            // First, try to extract text from the PDF
            let pdfText = '';
            try {
                const pdfParse = require('pdf-parse');
                const pdfBuffer = await fs.readFile(pdfPath);
                const pdfData = await pdfParse(pdfBuffer);
                pdfText = pdfData.text || 'Could not extract text from PDF';
            } catch (parseError) {
                console.warn('PDF text extraction failed:', parseError.message);
                pdfText = 'PDF content could not be extracted (may contain images or be encrypted)';
            }
            
            // Create a text-based image representation using Sharp
            const sharp = require('sharp');
            
            // Create a simple text image as fallback
            const width = 800;
            const height = 1000;
            const textLines = this.wrapText(pdfText.substring(0, 2000), 80); // Limit text and wrap
            
            // Create SVG with text content
            const svgContent = `
                <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
                    <rect width="100%" height="100%" fill="white"/>
                    <text x="20" y="40" font-family="Arial, sans-serif" font-size="14" fill="black">
                        ${textLines.slice(0, 60).map((line, i) => 
                            `<tspan x="20" dy="${i === 0 ? 0 : 18}">${this.escapeXml(line)}</tspan>`
                        ).join('')}
                    </text>
                    <text x="20" y="${height - 30}" font-family="Arial, sans-serif" font-size="12" fill="gray">
                        Page ${pageNumber} - Text extracted from PDF
                    </text>
                </svg>
            `;
            
            // Convert SVG to PNG using Sharp
            const imageBuffer = await sharp(Buffer.from(svgContent))
                .png()
                .toBuffer();
                
            await fs.writeFile(filePath, imageBuffer);

            return {
                success: true,
                filePath: filePath,
                fileName: fileName
            };

        } catch (error) {
            console.error('PDF to image fallback error:', error);
            
            // Final fallback - create a simple error image
            try {
                const fileName = `error_pdf_${Date.now()}.png`;
                const outputDir = path.join(__dirname, '..', 'tmp');
                const filePath = path.join(outputDir, fileName);
                
                const sharp = require('sharp');
                const errorSvg = `
                    <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
                        <rect width="100%" height="100%" fill="#f8f9fa"/>
                        <text x="200" y="120" text-anchor="middle" font-family="Arial" font-size="16" fill="#dc3545">
                            PDF Conversion Not Available
                        </text>
                        <text x="200" y="150" text-anchor="middle" font-family="Arial" font-size="12" fill="#6c757d">
                            This platform doesn't support PDF to image conversion
                        </text>
                        <text x="200" y="180" text-anchor="middle" font-family="Arial" font-size="12" fill="#6c757d">
                            Try converting to text format instead
                        </text>
                    </svg>
                `;
                
                const errorBuffer = await sharp(Buffer.from(errorSvg))
                    .png()
                    .toBuffer();
                    
                await fs.writeFile(filePath, errorBuffer);
                
                return {
                    success: true,
                    filePath: filePath,
                    fileName: fileName
                };
            } catch (finalError) {
                return {
                    success: false,
                    error: 'PDF to image conversion not supported on this platform'
                };
            }
        }
    }

    // Helper function to wrap text
    wrapText(text, lineLength) {
        const words = text.split(' ');
        const lines = [];
        let currentLine = '';
        
        for (const word of words) {
            if ((currentLine + word).length <= lineLength) {
                currentLine += (currentLine ? ' ' : '') + word;
            } else {
                if (currentLine) lines.push(currentLine);
                currentLine = word;
            }
        }
        if (currentLine) lines.push(currentLine);
        
        return lines;
    }

    // Helper function to escape XML special characters
    escapeXml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    async downloadFileRobust(fileMessage, type = 'direct', fullMessage = null) {
        try {
            const fileName = fileMessage.fileName || `temp_file_${Date.now()}`;
            const filePath = path.join(__dirname, '..', 'tmp', fileName);
            
            await fs.ensureDir(path.dirname(filePath));
            
            let buffer;
            
            if (type === 'quoted' && fullMessage) {
                // For quoted messages with full structure (like documentWithCaptionMessage)
                const { downloadMediaMessage } = require('baileys');
                
                // Create proper message structure for download
                const messageToDownload = {
                    key: {}, // Will be filled by Baileys
                    message: fullMessage
                };
                
                buffer = await downloadMediaMessage(messageToDownload, 'buffer', {}, {
                    logger: console,
                    reuploadRequest: this.bot.sock.updateMediaMessage
                });
            } else if (type === 'quoted') {
                // For simple quoted documents
                const { downloadMediaMessage } = require('baileys');
                buffer = await downloadMediaMessage({ documentMessage: fileMessage }, 'buffer', {}, {
                    logger: console,
                    reuploadRequest: this.bot.sock.updateMediaMessage
                });
            } else {
                // For direct messages, use the simple method
                buffer = await this.bot.sock.downloadMediaMessage(fileMessage);
            }
            
            await fs.writeFile(filePath, buffer);
            return filePath;

        } catch (error) {
            console.error('File download error:', error);
            throw new Error('Failed to download file');
        }
    }

    // Keep old method for backward compatibility
    async downloadFile(fileMessage) {
        return await this.downloadFileRobust(fileMessage, 'direct');
    }

    async convertDocToPdf(docPath) {
        try {
            // Use PDFKit to create PDF from DOC content
            const fileName = `converted_${Date.now()}.pdf`;
            const filePath = path.join(__dirname, '..', 'tmp', fileName);
            
            // Read DOC content (simplified - extract text)
            const docContent = await fs.readFile(docPath, 'utf8').catch(() => 'Document content could not be extracted');
            
            // Create PDF using PDFKit
            const PDFDocument = require('pdfkit');
            const doc = new PDFDocument({
                margin: 50,
                font: 'Helvetica'
            });
            
            const stream = fs.createWriteStream(filePath);
            doc.pipe(stream);
            
            // Add title
            doc.fontSize(16)
               .text('Converted Document', 50, 50);
            
            // Add content
            doc.fontSize(12)
               .text(docContent, 50, 100, {
                   width: 500,
                   align: 'left'
               });
            
            doc.end();
            
            // Wait for stream to finish
            await new Promise((resolve, reject) => {
                stream.on('finish', resolve);
                stream.on('error', reject);
            });
            
            return {
                success: true,
                filePath: filePath,
                fileName: fileName
            };

        } catch (error) {
            console.error('DOC to PDF conversion error:', error);
            return {
                success: false,
                error: 'Failed to convert DOC to PDF'
            };
        }
    }

    async convertPdfToDoc(pdfPath) {
        try {
            // Use pdf2pic to extract text and create DOC
            const fileName = `converted_${Date.now()}.docx`;
            const filePath = path.join(__dirname, '..', 'tmp', fileName);
            
            // Try to extract PDF text using pdf-parse
            let pdfText = '';
            try {
                const pdfParse = require('pdf-parse');
                const pdfBuffer = await fs.readFile(pdfPath);
                const pdfData = await pdfParse(pdfBuffer);
                pdfText = pdfData.text || 'Could not extract text from PDF';
            } catch (parseError) {
                console.error('PDF parsing error:', parseError);
                pdfText = 'PDF text extraction failed - content may contain images or be encrypted';
            }
            
            // Create DOCX using a simple approach
            const officegen = require('officegen');
            const docx = officegen('docx');
            
            // Add extracted text to document
            const paragraph = docx.createP();
            paragraph.addText('Converted from PDF\n\n');
            paragraph.addText(pdfText);
            
            // Save the document
            await new Promise((resolve, reject) => {
                const out = fs.createWriteStream(filePath);
                
                out.on('error', reject);
                out.on('close', resolve);
                
                docx.generate(out);
            });
            
            return {
                success: true,
                filePath: filePath,
                fileName: fileName
            };

        } catch (error) {
            console.error('PDF to DOC conversion error:', error);
            
            // Fallback: Create a simple text-based DOC
            try {
                const fallbackFileName = `converted_${Date.now()}.txt`;
                const fallbackPath = path.join(__dirname, '..', 'tmp', fallbackFileName);
                
                await fs.writeFile(fallbackPath, 
                    'PDF to DOC Conversion\n\n' +
                    'The original PDF could not be fully converted.\n' +
                    'This is a fallback text file.\n\n' +
                    'Reason: ' + error.message
                );
                
                return {
                    success: true,
                    filePath: fallbackPath,
                    fileName: fallbackFileName
                };
            } catch (fallbackError) {
                return {
                    success: false,
                    error: 'Failed to convert PDF to DOC'
                };
            }
        }
    }

    async cleanup() {
        console.log('🧹 Enhanced Converter plugin cleanup completed');
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new ConverterPlugin();
        await plugin.init(bot);
        return plugin;
    }
};
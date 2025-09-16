/**
 * File Converter Utility - 2025 Latest Methods
 * Supports: PDF ↔ Image, PDF ↔ DOC/DOCX, Image ↔ PDF conversions
 * 
 * Dependencies: Uses both existing packages and latest 2025 libraries
 * - pdf-to-img: PDF to image conversion
 * - sharp: High-performance image processing
 * - jimp: Image manipulation
 * - mammoth: DOCX to HTML/text
 * - libreoffice-convert: Document format conversion
 * - pdfkit: PDF generation
 * - pdf-parse: PDF text extraction
 */

const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const PDFDocument = require('pdfkit');
const mammoth = require('mammoth');
const libre = require('libreoffice-convert');
const { promisify } = require('util');
const jimp = require('jimp');

// Convert libreoffice-convert to promise-based
const convertAsync = promisify(libre.convert);

class FileConverter {
    constructor() {
        this.supportedFormats = {
            input: ['pdf', 'docx', 'doc', 'odt', 'jpg', 'jpeg', 'png', 'webp', 'tiff', 'bmp'],
            output: ['pdf', 'docx', 'doc', 'jpg', 'jpeg', 'png', 'webp', 'tiff', 'html', 'txt']
        };
    }

    /**
     * Convert PDF to Images (2025 Method using pdf-to-img)
     * @param {string|Buffer} pdfPath - Path to PDF file or Buffer
     * @param {Object} options - Conversion options
     * @returns {Promise<Array>} Array of image buffers
     */
    async pdfToImages(pdfPath, options = {}) {
        try {
            const pdf2img = require('pdf-to-img');
            
            const defaultOptions = {
                scale: options.scale || 2.0,
                format: options.format || 'png',
                quality: options.quality || 100,
                page: options.page || null, // null = all pages
                maxWidth: options.maxWidth || 2000,
                maxHeight: options.maxHeight || 2000
            };

            let pdfBuffer;
            if (typeof pdfPath === 'string') {
                pdfBuffer = await fs.readFile(pdfPath);
            } else {
                pdfBuffer = pdfPath;
            }

            const convert = pdf2img.convert;
            const images = await convert(pdfBuffer, {
                scale: defaultOptions.scale,
                format: defaultOptions.format
            });

            // Process images with Sharp for optimization
            const processedImages = await Promise.all(
                images.map(async (imageBuffer, index) => {
                    let processed = sharp(imageBuffer);
                    
                    if (defaultOptions.maxWidth || defaultOptions.maxHeight) {
                        processed = processed.resize(defaultOptions.maxWidth, defaultOptions.maxHeight, {
                            fit: 'inside',
                            withoutEnlargement: true
                        });
                    }

                    if (defaultOptions.format !== 'png') {
                        processed = processed.jpeg({ quality: defaultOptions.quality });
                    }

                    return {
                        buffer: await processed.toBuffer(),
                        page: index + 1,
                        filename: `page_${index + 1}.${defaultOptions.format}`
                    };
                })
            );

            return defaultOptions.page ? [processedImages[defaultOptions.page - 1]] : processedImages;
        } catch (error) {
            throw new Error(`PDF to Images conversion failed: ${error.message}`);
        }
    }

    /**
     * Convert Images to PDF (2025 Method using PDFKit + Sharp)
     * @param {Array} imagePaths - Array of image paths or buffers
     * @param {string} outputPath - Output PDF path
     * @param {Object} options - PDF options
     * @returns {Promise<Buffer>} PDF buffer
     */
    async imagesToPdf(imagePaths, outputPath = null, options = {}) {
        try {
            const defaultOptions = {
                pageSize: options.pageSize || 'A4',
                margin: options.margin || 50,
                autoFirstPage: false,
                quality: options.quality || 85
            };

            const doc = new PDFDocument(defaultOptions);
            const chunks = [];

            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => {});

            for (let i = 0; i < imagePaths.length; i++) {
                let imageBuffer;
                
                if (typeof imagePaths[i] === 'string') {
                    imageBuffer = await fs.readFile(imagePaths[i]);
                } else {
                    imageBuffer = imagePaths[i];
                }

                // Optimize image with Sharp
                const optimizedImage = await sharp(imageBuffer)
                    .jpeg({ quality: defaultOptions.quality })
                    .toBuffer();

                if (i > 0) doc.addPage();
                
                // Get page dimensions
                const pageWidth = doc.page.width - (defaultOptions.margin * 2);
                const pageHeight = doc.page.height - (defaultOptions.margin * 2);
                
                doc.image(optimizedImage, defaultOptions.margin, defaultOptions.margin, {
                    fit: [pageWidth, pageHeight],
                    align: 'center',
                    valign: 'center'
                });
            }

            doc.end();

            return new Promise((resolve, reject) => {
                doc.on('end', () => {
                    const pdfBuffer = Buffer.concat(chunks);
                    if (outputPath) {
                        fs.writeFile(outputPath, pdfBuffer)
                            .then(() => resolve(pdfBuffer))
                            .catch(reject);
                    } else {
                        resolve(pdfBuffer);
                    }
                });
                doc.on('error', reject);
            });
        } catch (error) {
            throw new Error(`Images to PDF conversion failed: ${error.message}`);
        }
    }

    /**
     * Convert PDF to DOCX (2025 Method using LibreOffice)
     * @param {string|Buffer} pdfPath - Path to PDF file or Buffer
     * @param {string} outputPath - Output DOCX path
     * @returns {Promise<Buffer>} DOCX buffer
     */
    async pdfToDocx(pdfPath, outputPath = null) {
        try {
            let pdfBuffer;
            if (typeof pdfPath === 'string') {
                pdfBuffer = await fs.readFile(pdfPath);
            } else {
                pdfBuffer = pdfPath;
            }

            const docxBuffer = await convertAsync(pdfBuffer, '.docx', undefined);
            
            if (outputPath) {
                await fs.writeFile(outputPath, docxBuffer);
            }
            
            return docxBuffer;
        } catch (error) {
            throw new Error(`PDF to DOCX conversion failed: ${error.message}`);
        }
    }

    /**
     * Convert DOCX to PDF (2025 Method using LibreOffice)
     * @param {string|Buffer} docxPath - Path to DOCX file or Buffer
     * @param {string} outputPath - Output PDF path
     * @returns {Promise<Buffer>} PDF buffer
     */
    async docxToPdf(docxPath, outputPath = null) {
        try {
            let docxBuffer;
            if (typeof docxPath === 'string') {
                docxBuffer = await fs.readFile(docxPath);
            } else {
                docxBuffer = docxPath;
            }

            const pdfBuffer = await convertAsync(docxBuffer, '.pdf', undefined);
            
            if (outputPath) {
                await fs.writeFile(outputPath, pdfBuffer);
            }
            
            return pdfBuffer;
        } catch (error) {
            throw new Error(`DOCX to PDF conversion failed: ${error.message}`);
        }
    }

    /**
     * Convert DOC to PDF (2025 Method using LibreOffice)
     * @param {string|Buffer} docPath - Path to DOC file or Buffer
     * @param {string} outputPath - Output PDF path
     * @returns {Promise<Buffer>} PDF buffer
     */
    async docToPdf(docPath, outputPath = null) {
        try {
            let docBuffer;
            if (typeof docPath === 'string') {
                docBuffer = await fs.readFile(docPath);
            } else {
                docBuffer = docPath;
            }

            const pdfBuffer = await convertAsync(docBuffer, '.pdf', undefined);
            
            if (outputPath) {
                await fs.writeFile(outputPath, pdfBuffer);
            }
            
            return pdfBuffer;
        } catch (error) {
            throw new Error(`DOC to PDF conversion failed: ${error.message}`);
        }
    }

    /**
     * Convert DOCX to HTML/Text (2025 Method using Mammoth)
     * @param {string|Buffer} docxPath - Path to DOCX file or Buffer
     * @param {string} format - Output format ('html' or 'text')
     * @returns {Promise<string>} Converted content
     */
    async docxToText(docxPath, format = 'html') {
        try {
            let docxBuffer;
            if (typeof docxPath === 'string') {
                docxBuffer = await fs.readFile(docxPath);
            } else {
                docxBuffer = docxPath;
            }

            const options = {
                convertImage: mammoth.images.imgElement(function(image) {
                    return image.read("base64").then(function(imageBuffer) {
                        return {
                            src: "data:" + image.contentType + ";base64," + imageBuffer
                        };
                    });
                })
            };

            if (format === 'text') {
                const result = await mammoth.extractRawText({ buffer: docxBuffer });
                return result.value;
            } else {
                const result = await mammoth.convertToHtml({ buffer: docxBuffer }, options);
                return result.value;
            }
        } catch (error) {
            throw new Error(`DOCX to ${format} conversion failed: ${error.message}`);
        }
    }

    /**
     * Convert Image formats (2025 Method using Sharp)
     * @param {string|Buffer} imagePath - Input image path or buffer
     * @param {string} outputFormat - Output format (jpg, png, webp, tiff, etc.)
     * @param {Object} options - Conversion options
     * @returns {Promise<Buffer>} Converted image buffer
     */
    async convertImageFormat(imagePath, outputFormat, options = {}) {
        try {
            let imageBuffer;
            if (typeof imagePath === 'string') {
                imageBuffer = await fs.readFile(imagePath);
            } else {
                imageBuffer = imagePath;
            }

            let sharpInstance = sharp(imageBuffer);

            // Apply transformations
            if (options.resize) {
                sharpInstance = sharpInstance.resize(options.resize.width, options.resize.height, {
                    fit: options.resize.fit || 'inside',
                    withoutEnlargement: options.resize.withoutEnlargement !== false
                });
            }

            // Convert to target format
            switch (outputFormat.toLowerCase()) {
                case 'jpg':
                case 'jpeg':
                    sharpInstance = sharpInstance.jpeg({ 
                        quality: options.quality || 85,
                        progressive: options.progressive || false
                    });
                    break;
                case 'png':
                    sharpInstance = sharpInstance.png({ 
                        quality: options.quality || 100,
                        compressionLevel: options.compressionLevel || 6
                    });
                    break;
                case 'webp':
                    sharpInstance = sharpInstance.webp({ 
                        quality: options.quality || 80,
                        lossless: options.lossless || false
                    });
                    break;
                case 'tiff':
                    sharpInstance = sharpInstance.tiff({ 
                        quality: options.quality || 80,
                        compression: options.compression || 'jpeg'
                    });
                    break;
                default:
                    throw new Error(`Unsupported output format: ${outputFormat}`);
            }

            return await sharpInstance.toBuffer();
        } catch (error) {
            throw new Error(`Image format conversion failed: ${error.message}`);
        }
    }

    /**
     * Universal converter function (2025 Smart Detection)
     * @param {string|Buffer} inputPath - Input file path or buffer
     * @param {string} targetFormat - Target format
     * @param {string} outputPath - Output file path (optional)
     * @param {Object} options - Conversion options
     * @returns {Promise<Buffer>} Converted file buffer
     */
    async convert(inputPath, targetFormat, outputPath = null, options = {}) {
        try {
            let inputFormat;
            
            if (typeof inputPath === 'string') {
                inputFormat = path.extname(inputPath).toLowerCase().substring(1);
            } else {
                // Try to detect format from buffer
                inputFormat = await this.detectFormatFromBuffer(inputPath);
            }

            const target = targetFormat.toLowerCase();
            
            console.log(`Converting ${inputFormat} to ${target}...`);

            let result;
            
            // Route to appropriate converter
            if (inputFormat === 'pdf') {
                switch (target) {
                    case 'jpg':
                    case 'jpeg':
                    case 'png':
                        const images = await this.pdfToImages(inputPath, { format: target, ...options });
                        result = images.length === 1 ? images[0].buffer : images;
                        break;
                    case 'docx':
                        result = await this.pdfToDocx(inputPath, outputPath);
                        break;
                    case 'html':
                    case 'txt':
                        const docxBuffer = await this.pdfToDocx(inputPath);
                        result = await this.docxToText(docxBuffer, target === 'html' ? 'html' : 'text');
                        break;
                    default:
                        throw new Error(`Conversion from PDF to ${target} not supported`);
                }
            } else if (['docx', 'doc'].includes(inputFormat)) {
                switch (target) {
                    case 'pdf':
                        result = inputFormat === 'docx' ? 
                            await this.docxToPdf(inputPath, outputPath) :
                            await this.docToPdf(inputPath, outputPath);
                        break;
                    case 'html':
                    case 'txt':
                        result = await this.docxToText(inputPath, target === 'html' ? 'html' : 'text');
                        break;
                    default:
                        throw new Error(`Conversion from ${inputFormat} to ${target} not supported`);
                }
            } else if (['jpg', 'jpeg', 'png', 'webp', 'tiff', 'bmp'].includes(inputFormat)) {
                switch (target) {
                    case 'pdf':
                        result = await this.imagesToPdf([inputPath], outputPath, options);
                        break;
                    case 'jpg':
                    case 'jpeg':
                    case 'png':
                    case 'webp':
                    case 'tiff':
                        result = await this.convertImageFormat(inputPath, target, options);
                        break;
                    default:
                        throw new Error(`Conversion from ${inputFormat} to ${target} not supported`);
                }
            } else {
                throw new Error(`Input format ${inputFormat} not supported`);
            }

            // Save to file if outputPath is provided and result is buffer
            if (outputPath && Buffer.isBuffer(result)) {
                await fs.writeFile(outputPath, result);
            }

            return result;
        } catch (error) {
            throw new Error(`Universal conversion failed: ${error.message}`);
        }
    }

    /**
     * Detect file format from buffer (2025 Method)
     * @param {Buffer} buffer - File buffer
     * @returns {Promise<string>} Detected format
     */
    async detectFormatFromBuffer(buffer) {
        try {
            // PDF detection
            if (buffer.toString('ascii', 0, 4) === '%PDF') {
                return 'pdf';
            }
            
            // ZIP-based formats (DOCX, etc.)
            if (buffer[0] === 0x50 && buffer[1] === 0x4B) {
                return 'docx'; // Assume DOCX for ZIP files
            }
            
            // DOC format
            if (buffer.toString('hex', 0, 8) === 'd0cf11e0a1b11ae1') {
                return 'doc';
            }
            
            // Image formats
            if (buffer[0] === 0xFF && buffer[1] === 0xD8) return 'jpg';
            if (buffer.toString('ascii', 1, 4) === 'PNG') return 'png';
            if (buffer.toString('ascii', 0, 4) === 'RIFF') return 'webp';
            if (buffer.toString('ascii', 0, 2) === 'BM') return 'bmp';
            
            throw new Error('Unknown file format');
        } catch (error) {
            throw new Error(`Format detection failed: ${error.message}`);
        }
    }

    /**
     * Get supported conversions (2025 Complete List)
     * @returns {Object} Supported conversion matrix
     */
    getSupportedConversions() {
        return {
            'PDF': {
                to: ['JPG', 'PNG', 'DOCX', 'HTML', 'TXT'],
                description: 'Convert PDF to images, documents, or text formats'
            },
            'DOCX': {
                to: ['PDF', 'HTML', 'TXT'],
                description: 'Convert Word documents to PDF or text formats'
            },
            'DOC': {
                to: ['PDF', 'HTML', 'TXT'],
                description: 'Convert legacy Word documents to PDF or text formats'
            },
            'Images (JPG/PNG/WEBP/TIFF)': {
                to: ['PDF', 'JPG', 'PNG', 'WEBP', 'TIFF'],
                description: 'Convert between image formats or create PDFs'
            }
        };
    }
}

// Export the converter class
module.exports = FileConverter;

// Export convenience functions for direct use
module.exports.pdfToImages = async (pdfPath, options) => {
    const converter = new FileConverter();
    return await converter.pdfToImages(pdfPath, options);
};

module.exports.imagesToPdf = async (imagePaths, outputPath, options) => {
    const converter = new FileConverter();
    return await converter.imagesToPdf(imagePaths, outputPath, options);
};

module.exports.pdfToDocx = async (pdfPath, outputPath) => {
    const converter = new FileConverter();
    return await converter.pdfToDocx(pdfPath, outputPath);
};

module.exports.docxToPdf = async (docxPath, outputPath) => {
    const converter = new FileConverter();
    return await converter.docxToPdf(docxPath, outputPath);
};

module.exports.convert = async (inputPath, targetFormat, outputPath, options) => {
    const converter = new FileConverter();
    return await converter.convert(inputPath, targetFormat, outputPath, options);
};

// Example usage:
/*
const FileConverter = require('./converter.js');

(async () => {
    const converter = new FileConverter();
    
    // Convert PDF to images
    const images = await converter.pdfToImages('document.pdf', { format: 'png', scale: 2 });
    
    // Convert DOCX to PDF
    await converter.docxToPdf('document.docx', 'output.pdf');
    
    // Convert images to PDF
    await converter.imagesToPdf(['image1.jpg', 'image2.png'], 'combined.pdf');
    
    // Universal converter
    await converter.convert('input.pdf', 'docx', 'output.docx');
    
    console.log('Conversions completed!');
})();
*/
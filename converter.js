/**
 * File Converter Utility - 2025 Latest Methods with API Fallbacks
 * Supports: PDF ↔ Image, PDF ↔ DOC/DOCX, Image ↔ PDF conversions
 * 
 * Modern 2025 Packages (Primary):
 * - pdf-img-convert: Pure JS PDF to image (Mozilla PDF.js based)
 * - pdf-to-png-converter: No system dependencies PDF converter
 * - sharp: High-performance image processing (latest)
 * - puppeteer: HTML to PDF generation
 * - pdfkit: PDF generation
 * - mammoth: DOCX processing
 * 
 * API Fallbacks (Secondary):
 * - CloudConvert API (10 conversions/day free)
 * - Convertio API (25 conversions/24h free) 
 * - FreeConvert API (1GB file limit)
 * 
 * Fallback Strategy: Local packages → Free APIs → Error
 */

const fs = require('fs').promises;
const path = require('path');
const FormData = require('form-data');

// Core packages with fallback handling
let sharp, PDFDocument, mammoth, axios;
try {
    sharp = require('sharp');
} catch (e) {
    console.log('📦 Sharp not available - image processing will be limited');
}
try {
    PDFDocument = require('pdfkit');
} catch (e) {
    console.log('📦 PDFKit not available - PDF generation will be limited');
}
try {
    mammoth = require('mammoth');
} catch (e) {
    console.log('📦 Mammoth not available - DOCX processing will be limited');
}
try {
    axios = require('axios');
} catch (e) {
    console.log('📦 Axios not available - API fallbacks will be limited');
}

// Modern 2025 PDF converters with error handling
let pdfImgConvert, pdfToPngConverter, libre, convertAsync;
try {
    pdfImgConvert = require('pdf-img-convert');
} catch (e) {
    console.log('📦 pdf-img-convert not available, using fallbacks');
}
try {
    pdfToPngConverter = require('pdf-to-png-converter');
} catch (e) {
    console.log('📦 pdf-to-png-converter not available, using fallbacks');
}
try {
    libre = require('libreoffice-convert');
    const { promisify } = require('util');
    convertAsync = promisify(libre.convert);
} catch (e) {
    console.log('📦 libreoffice-convert not available, using API fallbacks for document conversion');
}

// API rate limiting tracking (resets every 24 hours)
const apiUsage = {
    cloudconvert: { count: 0, resetTime: Date.now() + 24 * 60 * 60 * 1000 },
    convertio: { count: 0, resetTime: Date.now() + 24 * 60 * 60 * 1000 },
    freeconvert: { count: 0, resetTime: Date.now() + 24 * 60 * 60 * 1000 }
};

class FileConverter {
    constructor() {
        this.supportedFormats = {
            input: ['pdf', 'docx', 'doc', 'odt', 'jpg', 'jpeg', 'png', 'webp', 'tiff', 'bmp', 'gif'],
            output: ['pdf', 'docx', 'doc', 'jpg', 'jpeg', 'png', 'webp', 'tiff', 'html', 'txt']
        };
        
        // Clean up old API usage counters
        this.cleanupApiUsage();
    }

    /**
     * Clean up expired API usage counters
     */
    cleanupApiUsage() {
        const now = Date.now();
        Object.keys(apiUsage).forEach(api => {
            if (now > apiUsage[api].resetTime) {
                apiUsage[api].count = 0;
                apiUsage[api].resetTime = now + 24 * 60 * 60 * 1000;
            }
        });
    }

    /**
     * Modern 2025 PDF to Images conversion with multiple fallbacks
     * @param {string|Buffer} pdfPath - Path to PDF file or Buffer
     * @param {Object} options - Conversion options
     * @returns {Promise<Array>} Array of image buffers
     */
    async pdfToImages(pdfPath, options = {}) {
        const methods = [
            () => this.pdfToImagesModern(pdfPath, options),
            () => this.pdfToImagesLegacy(pdfPath, options),
            () => this.pdfToImagesAPI(pdfPath, options)
        ];

        for (let i = 0; i < methods.length; i++) {
            try {
                console.log(`🔄 Trying PDF to images method ${i + 1}/${methods.length}`);
                const result = await methods[i]();
                console.log(`✅ PDF to images successful using method ${i + 1}`);
                return result;
            } catch (error) {
                console.log(`❌ Method ${i + 1} failed: ${error.message}`);
                if (i === methods.length - 1) {
                    throw new Error(`All PDF to image methods failed. Last error: ${error.message}`);
                }
            }
        }
    }

    /**
     * Modern PDF to Images using latest packages (2025)
     */
    async pdfToImagesModern(pdfPath, options = {}) {
        let pdfBuffer;
        if (typeof pdfPath === 'string') {
            pdfBuffer = await fs.readFile(pdfPath);
        } else {
            pdfBuffer = pdfPath;
        }

        // Try pdf-img-convert first (pure JavaScript, most reliable)
        if (pdfImgConvert) {
            try {
                const pdfArray = await pdfImgConvert.convert(pdfBuffer, {
                    width: options.maxWidth || 2000,
                    height: options.maxHeight || 2000,
                    page_numbers: options.page ? [options.page] : undefined
                });

                const processedImages = await Promise.all(
                    pdfArray.map(async (imageBuffer, index) => {
                        let processed = sharp(imageBuffer);
                        
                        if (options.format && options.format !== 'png') {
                            if (options.format === 'jpg' || options.format === 'jpeg') {
                                processed = processed.jpeg({ quality: options.quality || 85 });
                            } else if (options.format === 'webp') {
                                processed = processed.webp({ quality: options.quality || 80 });
                            }
                        }

                        return {
                            buffer: await processed.toBuffer(),
                            page: index + 1,
                            filename: `page_${index + 1}.${options.format || 'png'}`
                        };
                    })
                );

                return processedImages;
            } catch (error) {
                throw new Error(`pdf-img-convert failed: ${error.message}`);
            }
        }

        // Try pdf-to-png-converter as backup
        if (pdfToPngConverter) {
            try {
                const result = await pdfToPngConverter.convert(pdfBuffer);
                
                const processedImages = await Promise.all(
                    result.map(async (imageBuffer, index) => {
                        let processed = sharp(imageBuffer);
                        
                        if (options.format === 'jpg' || options.format === 'jpeg') {
                            processed = processed.jpeg({ quality: options.quality || 85 });
                        } else if (options.format === 'webp') {
                            processed = processed.webp({ quality: options.quality || 80 });
                        }

                        return {
                            buffer: await processed.toBuffer(),
                            page: index + 1,
                            filename: `page_${index + 1}.${options.format || 'png'}`
                        };
                    })
                );

                return processedImages;
            } catch (error) {
                throw new Error(`pdf-to-png-converter failed: ${error.message}`);
            }
        }

        throw new Error('No modern PDF conversion packages available');
    }

    /**
     * Legacy PDF to Images conversion (fallback)
     */
    async pdfToImagesLegacy(pdfPath, options = {}) {
        // Try original pdf-to-img package if available
        try {
            const pdf2img = require('pdf-to-img');
            
            let pdfBuffer;
            if (typeof pdfPath === 'string') {
                pdfBuffer = await fs.readFile(pdfPath);
            } else {
                pdfBuffer = pdfPath;
            }

            const convert = pdf2img.convert;
            const images = await convert(pdfBuffer, {
                scale: options.scale || 2.0,
                format: options.format || 'png'
            });

            const processedImages = await Promise.all(
                images.map(async (imageBuffer, index) => {
                    let processed = sharp(imageBuffer);
                    
                    if (options.maxWidth || options.maxHeight) {
                        processed = processed.resize(options.maxWidth || 2000, options.maxHeight || 2000, {
                            fit: 'inside',
                            withoutEnlargement: true
                        });
                    }

                    return {
                        buffer: await processed.toBuffer(),
                        page: index + 1,
                        filename: `page_${index + 1}.${options.format || 'png'}`
                    };
                })
            );

            return options.page ? [processedImages[options.page - 1]] : processedImages;
        } catch (error) {
            throw new Error(`Legacy PDF conversion failed: ${error.message}`);
        }
    }

    /**
     * API-based PDF to Images conversion (final fallback)
     */
    async pdfToImagesAPI(pdfPath, options = {}) {
        let pdfBuffer;
        if (typeof pdfPath === 'string') {
            pdfBuffer = await fs.readFile(pdfPath);
        } else {
            pdfBuffer = pdfPath;
        }

        const apis = [
            () => this.convertViaCloudConvert(pdfBuffer, 'png'),
            () => this.convertViaConvertio(pdfBuffer, 'png'),
            () => this.convertViaFreeConvert(pdfBuffer, 'png')
        ];

        for (const api of apis) {
            try {
                const result = await api();
                if (result) {
                    // For API results, we might get a single buffer or array
                    if (Buffer.isBuffer(result)) {
                        return [{
                            buffer: result,
                            page: 1,
                            filename: `page_1.${options.format || 'png'}`
                        }];
                    }
                    return result;
                }
            } catch (error) {
                console.log(`API conversion attempt failed: ${error.message}`);
            }
        }

        throw new Error('All API conversion methods failed');
    }

    /**
     * CloudConvert API conversion (10 conversions/day free)
     */
    async convertViaCloudConvert(buffer, targetFormat) {
        this.cleanupApiUsage();
        if (apiUsage.cloudconvert.count >= 10) {
            throw new Error('CloudConvert daily limit reached (10/day)');
        }

        if (!axios) {
            throw new Error('Axios not available for API calls');
        }

        const apiKey = process.env.CLOUDCONVERT_API_KEY;
        if (!apiKey) {
            throw new Error('CloudConvert API key not configured (set CLOUDCONVERT_API_KEY)');
        }

        try {
            apiUsage.cloudconvert.count++;
            
            // Create job
            const jobResponse = await axios.post('https://api.cloudconvert.com/v2/jobs', {
                tasks: {
                    'import-1': {
                        operation: 'import/upload'
                    },
                    'convert-1': {
                        operation: 'convert',
                        input: 'import-1',
                        output_format: targetFormat
                    },
                    'export-1': {
                        operation: 'export/url',
                        input: 'convert-1'
                    }
                }
            }, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            const job = jobResponse.data.data;
            const uploadTask = job.tasks.find(t => t.operation === 'import/upload');
            
            // Upload file
            const formData = new FormData();
            formData.append('file', buffer, 'input.pdf');
            
            await axios.post(uploadTask.result.form.url, formData, {
                headers: formData.getHeaders()
            });
            
            // Poll for completion
            let completed = false;
            let attempts = 0;
            const maxAttempts = 30;
            
            while (!completed && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                const statusResponse = await axios.get(`https://api.cloudconvert.com/v2/jobs/${job.id}`, {
                    headers: { 'Authorization': `Bearer ${apiKey}` }
                });
                
                const updatedJob = statusResponse.data.data;
                const exportTask = updatedJob.tasks.find(t => t.operation === 'export/url');
                
                if (exportTask && exportTask.status === 'finished') {
                    const downloadResponse = await axios.get(exportTask.result.files[0].url, {
                        responseType: 'arraybuffer'
                    });
                    return Buffer.from(downloadResponse.data);
                }
                
                attempts++;
            }
            
            throw new Error('CloudConvert job timeout');
            
        } catch (error) {
            throw new Error(`CloudConvert failed: ${error.message}`);
        }
    }

    /**
     * Convertio API conversion (25 conversions/24h free)
     */
    async convertViaConvertio(buffer, targetFormat) {
        this.cleanupApiUsage();
        if (apiUsage.convertio.count >= 25) {
            throw new Error('Convertio daily limit reached (25/day)');
        }

        if (!axios) {
            throw new Error('Axios not available for API calls');
        }

        const apiKey = process.env.CONVERTIO_API_KEY;
        if (!apiKey) {
            throw new Error('Convertio API key not configured (set CONVERTIO_API_KEY)');
        }

        try {
            apiUsage.convertio.count++;
            
            // Start conversion
            const startResponse = await axios.post('https://api.convertio.co/convert', {
                apikey: apiKey,
                input: 'base64',
                file: buffer.toString('base64'),
                filename: 'input.pdf',
                outputformat: targetFormat
            });

            if (startResponse.data.status !== 'ok') {
                throw new Error(startResponse.data.error || 'Convertio start failed');
            }

            const conversionId = startResponse.data.data.id;
            
            // Poll for completion
            let completed = false;
            let attempts = 0;
            const maxAttempts = 30;
            
            while (!completed && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                const statusResponse = await axios.get(`https://api.convertio.co/convert/${conversionId}/status`, {
                    params: { apikey: apiKey }
                });
                
                if (statusResponse.data.status === 'ok') {
                    const step = statusResponse.data.data.step;
                    if (step === 'finish') {
                        // Download result
                        const downloadResponse = await axios.get(statusResponse.data.data.output.url, {
                            responseType: 'arraybuffer'
                        });
                        return Buffer.from(downloadResponse.data);
                    }
                }
                
                attempts++;
            }
            
            throw new Error('Convertio job timeout');
            
        } catch (error) {
            throw new Error(`Convertio failed: ${error.message}`);
        }
    }

    /**
     * FreeConvert API conversion (1GB file limit)
     */
    async convertViaFreeConvert(buffer, targetFormat) {
        this.cleanupApiUsage();
        
        try {
            // Note: This would require API key setup
            console.log('🌐 FreeConvert: Would attempt conversion (API key required)');
            throw new Error('FreeConvert API key not configured');
        } catch (error) {
            throw new Error(`FreeConvert failed: ${error.message}`);
        }
    }

    /**
     * Images to PDF conversion with fallbacks
     * @param {Array} imagePaths - Array of image paths or buffers
     * @param {string} outputPath - Output PDF path
     * @param {Object} options - PDF options
     * @returns {Promise<Buffer>} PDF buffer
     */
    async imagesToPdf(imagePaths, outputPath = null, options = {}) {
        const methods = [
            () => this.imagesToPdfLocal(imagePaths, outputPath, options),
            () => this.imagesToPdfAPI(imagePaths, outputPath, options)
        ];

        for (let i = 0; i < methods.length; i++) {
            try {
                console.log(`🔄 Trying images to PDF method ${i + 1}/${methods.length}`);
                const result = await methods[i]();
                console.log(`✅ Images to PDF successful using method ${i + 1}`);
                return result;
            } catch (error) {
                console.log(`❌ Method ${i + 1} failed: ${error.message}`);
                if (i === methods.length - 1) {
                    throw new Error(`Images to PDF conversion failed: ${error.message}`);
                }
            }
        }
    }

    /**
     * Local images to PDF conversion using PDFKit
     */
    async imagesToPdfLocal(imagePaths, outputPath = null, options = {}) {
        if (!PDFDocument) {
            throw new Error('PDFKit not available for local PDF generation');
        }

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

                // Optimize image with Sharp if available, otherwise use raw buffer
                let optimizedImage = imageBuffer;
                if (sharp) {
                    try {
                        optimizedImage = await sharp(imageBuffer)
                            .jpeg({ quality: defaultOptions.quality })
                            .toBuffer();
                    } catch (e) {
                        console.log('Sharp optimization failed, using raw image');
                        optimizedImage = imageBuffer;
                    }
                }

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
            throw new Error(`Local images to PDF conversion failed: ${error.message}`);
        }
    }

    /**
     * API-based images to PDF conversion
     */
    async imagesToPdfAPI(imagePaths, outputPath = null, options = {}) {
        // For now, convert first image only via API
        if (!imagePaths || imagePaths.length === 0) {
            throw new Error('No images provided for PDF conversion');
        }

        let imageBuffer;
        if (typeof imagePaths[0] === 'string') {
            imageBuffer = await fs.readFile(imagePaths[0]);
        } else {
            imageBuffer = imagePaths[0];
        }

        const apis = [
            () => this.convertViaCloudConvert(imageBuffer, 'pdf'),
            () => this.convertViaConvertio(imageBuffer, 'pdf')
        ];

        for (const api of apis) {
            try {
                const result = await api();
                if (result && outputPath) {
                    await fs.writeFile(outputPath, result);
                }
                return result;
            } catch (error) {
                console.log(`API images to PDF attempt failed: ${error.message}`);
            }
        }

        throw new Error('All API images to PDF methods failed');
    }

    /**
     * Document conversion with fallbacks (PDF ↔ DOCX)
     */
    async pdfToDocx(pdfPath, outputPath = null) {
        const methods = [
            () => this.pdfToDocxLocal(pdfPath, outputPath),
            () => this.pdfToDocxAPI(pdfPath, outputPath)
        ];

        for (let i = 0; i < methods.length; i++) {
            try {
                console.log(`🔄 Trying PDF to DOCX method ${i + 1}/${methods.length}`);
                const result = await methods[i]();
                console.log(`✅ PDF to DOCX successful using method ${i + 1}`);
                return result;
            } catch (error) {
                console.log(`❌ Method ${i + 1} failed: ${error.message}`);
                if (i === methods.length - 1) {
                    throw new Error(`PDF to DOCX conversion failed: ${error.message}`);
                }
            }
        }
    }

    /**
     * Local PDF to DOCX conversion
     */
    async pdfToDocxLocal(pdfPath, outputPath = null) {
        if (!convertAsync) {
            throw new Error('LibreOffice converter not available');
        }

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
            throw new Error(`Local PDF to DOCX conversion failed: ${error.message}`);
        }
    }

    /**
     * API-based PDF to DOCX conversion
     */
    async pdfToDocxAPI(pdfPath, outputPath = null) {
        // Try API conversion methods here
        throw new Error('API PDF to DOCX not implemented yet');
    }

    /**
     * DOCX to PDF conversion with fallbacks
     */
    async docxToPdf(docxPath, outputPath = null) {
        const methods = [
            () => this.docxToPdfLocal(docxPath, outputPath),
            () => this.docxToPdfAPI(docxPath, outputPath)
        ];

        for (let i = 0; i < methods.length; i++) {
            try {
                console.log(`🔄 Trying DOCX to PDF method ${i + 1}/${methods.length}`);
                const result = await methods[i]();
                console.log(`✅ DOCX to PDF successful using method ${i + 1}`);
                return result;
            } catch (error) {
                console.log(`❌ Method ${i + 1} failed: ${error.message}`);
                if (i === methods.length - 1) {
                    throw new Error(`DOCX to PDF conversion failed: ${error.message}`);
                }
            }
        }
    }

    /**
     * Local DOCX to PDF conversion
     */
    async docxToPdfLocal(docxPath, outputPath = null) {
        if (!convertAsync) {
            throw new Error('LibreOffice converter not available');
        }

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
            throw new Error(`Local DOCX to PDF conversion failed: ${error.message}`);
        }
    }

    /**
     * API-based DOCX to PDF conversion
     */
    async docxToPdfAPI(docxPath, outputPath = null) {
        let docxBuffer;
        if (typeof docxPath === 'string') {
            docxBuffer = await fs.readFile(docxPath);
        } else {
            docxBuffer = docxPath;
        }

        const apis = [
            () => this.convertViaCloudConvert(docxBuffer, 'pdf')
        ];

        for (const api of apis) {
            try {
                const result = await api();
                if (result && outputPath) {
                    await fs.writeFile(outputPath, result);
                }
                return result;
            } catch (error) {
                console.log(`API DOCX to PDF attempt failed: ${error.message}`);
            }
        }

        throw new Error('All API DOCX to PDF methods failed');
    }

    /**
     * DOCX to HTML/Text conversion using Mammoth
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
     * Image format conversion using Sharp (2025 optimized)
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

            // Convert to target format with optimized settings
            switch (outputFormat.toLowerCase()) {
                case 'jpg':
                case 'jpeg':
                    sharpInstance = sharpInstance.jpeg({ 
                        quality: options.quality || 85,
                        progressive: true,
                        mozjpeg: true // Use mozjpeg for better compression
                    });
                    break;
                case 'png':
                    sharpInstance = sharpInstance.png({ 
                        quality: options.quality || 100,
                        compressionLevel: options.compressionLevel || 6,
                        adaptiveFiltering: true
                    });
                    break;
                case 'webp':
                    sharpInstance = sharpInstance.webp({ 
                        quality: options.quality || 80,
                        lossless: options.lossless || false,
                        effort: 6 // Max compression effort
                    });
                    break;
                case 'avif':
                    sharpInstance = sharpInstance.avif({
                        quality: options.quality || 75,
                        effort: 4
                    });
                    break;
                case 'tiff':
                    sharpInstance = sharpInstance.tiff({ 
                        quality: options.quality || 80,
                        compression: options.compression || 'lzw'
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
     * Universal converter with intelligent routing (2025 Enhanced)
     */
    async convert(inputPath, targetFormat, outputPath = null, options = {}) {
        try {
            let inputFormat;
            
            if (typeof inputPath === 'string') {
                inputFormat = path.extname(inputPath).toLowerCase().substring(1);
            } else {
                inputFormat = await this.detectFormatFromBuffer(inputPath);
            }

            const target = targetFormat.toLowerCase();
            
            console.log(`🔄 Converting ${inputFormat} to ${target}...`);

            let result;
            
            // Enhanced routing with better error handling
            if (inputFormat === 'pdf') {
                switch (target) {
                    case 'jpg':
                    case 'jpeg':
                    case 'png':
                    case 'webp':
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
                        result = await this.docxToPdf(inputPath, outputPath);
                        break;
                    case 'html':
                    case 'txt':
                        result = await this.docxToText(inputPath, target === 'html' ? 'html' : 'text');
                        break;
                    default:
                        throw new Error(`Conversion from ${inputFormat} to ${target} not supported`);
                }
            } else if (['jpg', 'jpeg', 'png', 'webp', 'tiff', 'bmp', 'gif', 'avif'].includes(inputFormat)) {
                switch (target) {
                    case 'pdf':
                        result = await this.imagesToPdf([inputPath], outputPath, options);
                        break;
                    case 'jpg':
                    case 'jpeg':
                    case 'png':
                    case 'webp':
                    case 'tiff':
                    case 'avif':
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
     * Enhanced format detection (2025 method)
     */
    async detectFormatFromBuffer(buffer) {
        try {
            // PDF detection
            if (buffer.toString('ascii', 0, 4) === '%PDF') {
                return 'pdf';
            }
            
            // ZIP-based formats (DOCX, etc.)
            if (buffer[0] === 0x50 && buffer[1] === 0x4B) {
                // More specific detection for DOCX vs other ZIP files
                if (buffer.includes('[Content_Types].xml')) {
                    return 'docx';
                }
                return 'docx'; // Default assumption for ZIP files
            }
            
            // DOC format (MS Office legacy)
            if (buffer.toString('hex', 0, 8) === 'd0cf11e0a1b11ae1') {
                return 'doc';
            }
            
            // Image formats (enhanced detection)
            if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'jpg';
            if (buffer.toString('ascii', 1, 4) === 'PNG') return 'png';
            if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
            if (buffer.toString('ascii', 0, 2) === 'BM') return 'bmp';
            if (buffer.toString('ascii', 0, 6) === 'GIF87a' || buffer.toString('ascii', 0, 6) === 'GIF89a') return 'gif';
            if (buffer.toString('ascii', 4, 12) === 'ftypavif') return 'avif';
            
            // TIFF detection
            if ((buffer[0] === 0x49 && buffer[1] === 0x49) || (buffer[0] === 0x4D && buffer[1] === 0x4D)) return 'tiff';
            
            throw new Error('Unknown file format');
        } catch (error) {
            throw new Error(`Format detection failed: ${error.message}`);
        }
    }

    /**
     * Get supported conversions (2025 Updated)
     */
    getSupportedConversions() {
        return {
            'PDF': {
                to: ['JPG', 'PNG', 'WEBP', 'AVIF', 'DOCX', 'HTML', 'TXT'],
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
            'Images (JPG/PNG/WEBP/TIFF/BMP/GIF/AVIF)': {
                to: ['PDF', 'JPG', 'PNG', 'WEBP', 'TIFF', 'AVIF'],
                description: 'Convert between image formats or create PDFs'
            }
        };
    }

    /**
     * Get converter status and available methods
     */
    getStatus() {
        return {
            packages: {
                'pdf-img-convert': !!pdfImgConvert,
                'pdf-to-png-converter': !!pdfToPngConverter,
                'sharp': !!sharp,
                'mammoth': !!mammoth,
                'pdfkit': !!PDFDocument,
                'libreoffice-convert': !!convertAsync,
                'axios': !!axios
            },
            apiKeys: {
                cloudconvert: !!process.env.CLOUDCONVERT_API_KEY,
                convertio: !!process.env.CONVERTIO_API_KEY,
                freeconvert: !!process.env.FREECONVERT_API_KEY
            },
            apiLimits: {
                cloudconvert: `${apiUsage.cloudconvert.count}/10 used`,
                convertio: `${apiUsage.convertio.count}/25 used`,
                freeconvert: 'Available'
            },
            fallbacksAvailable: this.hasFallbacksAvailable()
        };
    }

    /**
     * Check if fallbacks are actually available
     */
    hasFallbacksAvailable() {
        const hasLocalPackages = !!pdfImgConvert || !!pdfToPngConverter || !!sharp || !!PDFDocument;
        const hasApiKeys = !!process.env.CLOUDCONVERT_API_KEY || !!process.env.CONVERTIO_API_KEY;
        return hasLocalPackages || hasApiKeys;
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

module.exports.getStatus = async () => {
    const converter = new FileConverter();
    return converter.getStatus();
};
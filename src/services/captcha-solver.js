import { createWorker } from 'tesseract.js';

export class CaptchaSolver {
  static async solve(page, selector) {
    try {
      // Handle different types of captchas
      if (selector.includes('recaptcha')) {
        await this.solveRecaptcha(page);
      } else if (selector.includes('hcaptcha')) {
        await this.solveHCaptcha(page);
      } else {
        await this.solveImageCaptcha(page, selector);
      }
    } catch (error) {
      console.error('Failed to solve captcha:', error);
      throw error;
    }
  }

  static async solveRecaptcha(page) {
    // Wait for reCAPTCHA iframe to load
    const frame = await page.waitForSelector('iframe[src*="recaptcha"]');
    
    // Switch to reCAPTCHA iframe context
    const recaptchaFrame = await frame.contentFrame();
    
    // Click the checkbox
    await recaptchaFrame.click('#recaptcha-anchor');
    
    // Wait for verification
    await page.waitForFunction(() => {
      const iframe = document.querySelector('iframe[src*="recaptcha"]');
      return iframe && iframe.contentWindow.document.querySelector('.recaptcha-checkbox-checked');
    });
  }

  static async solveHCaptcha(page) {
    // Similar to reCAPTCHA but for hCaptcha
    const frame = await page.waitForSelector('iframe[src*="hcaptcha"]');
    const hcaptchaFrame = await frame.contentFrame();
    
    await hcaptchaFrame.click('.checkbox');
    
    await page.waitForFunction(() => {
      const iframe = document.querySelector('iframe[src*="hcaptcha"]');
      return iframe && iframe.contentWindow.document.querySelector('.checked');
    });
  }

  static async solveImageCaptcha(page, selector) {
    // Get captcha image
    const captchaElement = await page.$(selector);
    const imageBuffer = await captchaElement.screenshot();
    
    // Use Tesseract.js for OCR
    const worker = await createWorker();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
    
    // Set parameters for better accuracy with captchas
    await worker.setParameters({
      tessedit_char_whitelist: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
    });
    
    const { data: { text } } = await worker.recognize(imageBuffer);
    await worker.terminate();
    
    // Find and fill captcha input
    const inputSelector = 'input[name*="captcha"], input[id*="captcha"]';
    await page.type(inputSelector, text.trim());
    
    // Submit form
    const submitButton = await page.$('button[type="submit"], input[type="submit"]');
    if (submitButton) {
      await submitButton.click();
    }
  }
}
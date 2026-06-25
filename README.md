RD - AI Image Detector Pro

A transparency-first Chrome Extension designed to help users identify potential AI-generated media. By combining local metadata analysis (C2PA/EXIF) with remote heuristic visual scoring, this extension provides an evidence-based probability score without compromising user privacy.

🚀 Tech Stack

Platform: Chrome Extension Manifest V3

Language: Vanilla JavaScript (ES6+)

Metadata Parsing: exifr.js (Local extraction of C2PA/XMP/EXIF data)

Heuristic Analysis: Sightengine Computer Vision API (Optional integration for deep visual analysis)

Data Handling: chrome.storage.local (Secure local storage for API keys and preferences)

Build/UI: Vanilla HTML5 / CSS3

📦 Features

Offline First: Instantly scans images for embedded C2PA, EXIF, and XMP metadata signatures without requiring any API keys or internet connection.

Advanced Heuristics: Optionally connects to Sightengine to perform pixel-level analysis for GAN artifacts and AI-generated media patterns.

Privacy-Focused: No browsing history or personal files are ever tracked. Only the URL of the selected image is processed for detection.

Transparent Scoring: Returns a confidence percentage based on signal strength, never claiming 100% accuracy to ensure user trust.

🛠 Setup & Installation

1. Prerequisites

Ensure you have the libs folder in your root directory containing exifr.js.

Download exifr.js and place it in the libs/ folder.

2. Loading into Chrome

Clone this repository to your local machine.

Open Chrome and navigate to chrome://extensions/.

Toggle Developer mode in the top-right corner.

Click Load unpacked.

Select the project directory.

3. API Key Configuration (Optional)

To enable the "Visual Heuristic API" signal:

Sign up for a free account at Sightengine.

Copy your API_USER and API_SECRET.

Click the extension icon in your browser toolbar.

Enter your credentials in the settings (if you have implemented the settings UI) or update the popup.js constant placeholders.

📝 Usage

Navigate to any webpage.

Right-click on any image.

Select "Check if AI-generated" from the context menu.

Click the Extension icon in your browser toolbar to view the detailed probability analysis.

⚖️ Disclaimer

AI detection is a rapidly evolving field. This tool provides an estimate based on known signatures and heuristic patterns. It should be used as a research aid and never as definitive proof. We are committed to transparency; detection scores are capped at 99% to reflect technical limitations.

📄 Privacy Policy

See the [Privacy Policy](https://docs.google.com/document/d/1UduUmw2jP3JarNK3AMinYMynZcutILBX_7oejUBhIy0/edit?tab=t.0) for full details on our data handling practices.

// The main model the next session will start on, for the status line.
// Reads `mainModel` from the user's sdlc-review.json (the file /sdlc:main-model
// writes). Kept apart from hooks/lib/review-config.js because the installed
// status line copies only the files listed in statusline-install.js COPY_FILES.
'use strict';

const fs = require('fs');
const path = require('path');

const CONFIG_NAME = 'sdlc-review.json';
const USER_CONFIG_ENV = 'SDLC_REVIEW_CONFIG_USER';
const MAIN_MODEL_KEY = 'mainModel';
const MODELS = ['haiku', 'sonnet', 'opus'];

/**
 * Reads the model /sdlc:main-model stored for the next session.
 *
 * Returns:
 *   One of haiku, sonnet or opus; null when the file is missing, malformed,
 *   holds "off" or holds anything else.
 */
function pendingModel() {
    try {
        const home = process.env.USERPROFILE || process.env.HOME || '';
        const file = process.env[USER_CONFIG_ENV] || path.join(home, '.claude', CONFIG_NAME);
        const value = JSON.parse(fs.readFileSync(file, 'utf8'))[MAIN_MODEL_KEY];
        return MODELS.includes(value) ? value : null;
    } catch (e) {
        return null;
    }
}

module.exports = { pendingModel };

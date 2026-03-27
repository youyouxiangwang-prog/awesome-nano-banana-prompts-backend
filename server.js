const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3099;

// In-memory store for like counts (in production, use Redis or database)
const likeCounts = {};
const savedPrompts = new Set();

// GitHub repo config - SET GH_TOKEN environment variable before running
const GITHUB_TOKEN = process.env.GH_TOKEN;
if (!GITHUB_TOKEN) {
    console.warn('[WARN] GH_TOKEN not set - GitHub auto-save will not work');
}
const REPO_OWNER = 'youyouxiangwang-prog';
const REPO_NAME = 'awesome-nano-banana-prompts';
const SAVED_BRANCH = 'main';
const SAVED_DIR = 'saved';

// Middleware
app.use(cors());
app.use(express.json());

// Get like count for a prompt
app.get('/api/likes/:promptId', (req, res) => {
    const { promptId } = req.params;
    const count = likeCounts[promptId] || 0;
    const saved = savedPrompts.has(promptId);
    res.json({ promptId, count, saved });
});

// Get all like counts
app.get('/api/likes', (req, res) => {
    res.json(likeCounts);
});

// Like a prompt
app.post('/api/likes', (req, res) => {
    const { promptId } = req.body;
    if (!promptId) {
        return res.status(400).json({ error: 'promptId required' });
    }

    // Initialize or increment
    if (!likeCounts[promptId]) {
        likeCounts[promptId] = 0;
    }
    likeCounts[promptId]++;
    const count = likeCounts[promptId];

    console.log(`[LIKES] prompt-${promptId}: ${count} likes`);

    // Check if reached threshold
    if (count === 3 && !savedPrompts.has(promptId)) {
        savedPrompts.add(promptId);
        console.log(`[SAVE] prompt-${promptId} reached 3 likes, saving to GitHub...`);
        saveToGitHub(promptId);
    }

    res.json({ promptId, count, saved: savedPrompts.has(promptId) });
});

// Save prompt data to GitHub
async function saveToGitHub(promptId) {
    if (!GITHUB_TOKEN) {
        console.log('[GIT] GH_TOKEN not set, skipping save');
        return;
    }
    try {
        // Save minimal data - the full prompt is in data.js
        const saveData = {
            id: parseInt(promptId),
            savedAt: new Date().toISOString(),
            likes: likeCounts[promptId],
            note: 'Full prompt data available in data.js or gallery'
        };

        const filename = `prompt-${promptId}.json`;
        const content = JSON.stringify(saveData, null, 2);
        const encodedContent = Buffer.from(content).toString('base64');

        // Use GitHub API to create/update file
        const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${SAVED_DIR}/${filename}`;
        
        // Check if file exists first
        let sha = null;
        try {
            const checkResponse = await fetch(apiUrl, {
                headers: {
                    'Authorization': `token ${GITHUB_TOKEN}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            if (checkResponse.ok) {
                const existingFile = await checkResponse.json();
                sha = existingFile.sha;
            }
        } catch (e) {
            console.log('[GIT] File does not exist yet, will create new');
        }

        // Create or update file
        const fileData = {
            message: `feat: save prompt #${promptId} (auto: 3 likes reached)`,
            content: encodedContent,
            branch: SAVED_BRANCH
        };
        if (sha) fileData.sha = sha;

        const response = await fetch(apiUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(fileData)
        });

        if (response.ok) {
            console.log(`[GIT] ✅ Saved prompt #${promptId} to GitHub`);
        } else {
            const err = await response.text();
            console.error(`[GIT] ❌ Failed to save: ${err}`);
        }
    } catch (error) {
        console.error('[GIT] Error saving to GitHub:', error.message);
    }
}

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        likes: Object.keys(likeCounts).length, 
        saved: savedPrompts.size,
        githubConfigured: !!GITHUB_TOKEN
    });
});

app.listen(PORT, () => {
    console.log(`🍌 Nano Banana Likes Backend running on http://localhost:${PORT}`);
    console.log(`   GitHub Token: ${GITHUB_TOKEN ? '✓ configured' : '✗ not set (GitHub auto-save disabled)'}`);
});

#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

// Repository information
const repoFullName = process.env.GITHUB_REPOSITORY;
const [owner, repo] = repoFullName ? repoFullName.split('/') : [null, null];
const branchName = process.env.GITHUB_HEAD_REF;

// Ignored paths that won't be checked for TODOs
const ignoredPaths = [
    '.github',
    '.git'
];

// Todo matching regexes
const regexes = {
    'assigned': /(?<type>Todo) (?:\((?<assignee>.+)\))?:? (?<message>.+)/gi
};

/**
 * Format a GitHub file link from a todo object
 * @param todo The todo to format it from
 * @returns {string} The link
 */
const formatLinkFromTodo = todo => {
    if (!owner || !repo || !branchName) return `${todo.path}:${todo.line}:${todo.char}`;
    return `https://github.com/${owner}/${repo}/blob/${branchName}/${todo.path}#L${todo.line}`;
};

const todos = [];
const getFileTodos = async filePath => {
    const relativePath = path.relative(process.cwd(), filePath);

    // Read file
    let data;
    try {
        data = await fs.readFile(filePath, 'utf8');
    } catch (e) {
        console.error(`Unable to read file at ${path}: ${e.message || e}`);
        return;
    }

    // Split the file content into lines
    const lines = data.split(/\r?\n/);

    // Go through each regex match
    for (const [regexName, regex] of Object.entries(regexes)) {

        lines.forEach((text, line) => {
            let match;
            while ((match = regex.exec(text)) !== null) {

                const {type, assignee, message} = match.groups;

                todos.push({
                    type,
                    assignee,
                    message: message,
                    path: relativePath,
                    line: line + 1,
                    char: match.index + 1,
                    matcher: regexName
                });
            }
        });
    }
};


const checkDirectory = async directory => {

    // Read all files in the directory
    let files;
    try {
        files = await fs.readdir(directory);
    } catch (e) {
        return;
    }

    outer:
        for (const file of files) {
            // Get & check the file path
            const filePath = path.join(directory, file);
            for (const ignoredPath of ignoredPaths) {
                if (filePath.includes(ignoredPath)) continue outer;
            }

            // Get file info
            let stats;
            try {
                stats = await fs.stat(filePath);
            } catch (e) {
                return;
            }

            // Recursively read directory or check file
            if (stats.isDirectory()) {
                await checkDirectory(filePath);
            } else if (stats.isFile()) {
                await getFileTodos(filePath);
            }
        }
};

(async () => {
    await checkDirectory(process.cwd());

    if (todos.length > 0) {
        let formattedTodos = '';
        for (const todo of todos) {
            const link = formatLinkFromTodo(todo);
            formattedTodos += `| @${todo.assignee} | _${todo.message}_ | [Open](${link})\n`;
        }

        console.log(`
## 👋 **HEADS UP**: There are still todos found:
| User      | Message   | Link        |
| :-------- | :-------- | :---------- |
${formattedTodos}
<sub>🤖 Todo Finder ✨</sub>
        `);
    }
})();
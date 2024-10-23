# AI Commit Message Generator

Generate commit messages using AI models.

This tool uses both the Google Gemini AI model and the Groq AI model to generate commit messages based on your git diff.

## Prerequisites

* Node.js (v20 or later) (free)
* npm (free)
* Git (free)
* Google AI Studio API key (free)
* Groq API key (free)

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/Mandy9943/commit-gen.git
   cd commit-gen
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file in the project root:
   ```
   touch .env
   ```

4. Obtain a free Google AI Studio API key:
   - Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
   - Sign in with your Google account
   - Generate a new API key

5. Obtain a free Groq API key:
   - Visit [Groq](https://console.groq.com/)
   - Sign up for an account
   - Generate a new API key

6. Add your API keys to the `.env` file:
   ```
   GOOGLE_API_KEY=your_google_api_key_here
   GROQ_API_KEY=your_groq_api_key_here
   ```

7. Make sure your script has the right permissions and is executable:
   ```
   chmod +x index.js
   ```

8. Install the tool globally:
   ```
   npm link
   ```

## Configuration

In the `index.js` file, locate this line:
```javascript
path: path.join(process.env.HOME, "projects/commit-gen/.env"),
```
Adjust this path to match your project's location on your system. For example:
```javascript
path: path.join(process.env.HOME, "path/to/your/project/.env"),
```

## Usage

Once installed globally, you can run these commands in any project directory:

```
commit-gen gr  # Generate commit message using Groq AI (llama3-70b-8192 model)
commit-gen ge  # Generate commit message using Google Gemini AI (gemini-1.5-pro model)
```

These commands will use your current git diff to generate a commit message and offer to commit it automatically. If you just want the message without committing, you can modify the flow as needed.

## Operating System Compatibility

This tool is primarily designed for Unix-based systems (Linux, macOS). For Windows users:

1. Replace `process.env.HOME` with `process.env.USERPROFILE` in the `index.js` file.
2. Use backslashes (`\`) instead of forward slashes (`/`) in file paths.
3. Consider using a tool like [cross-env](https://www.npmjs.com/package/cross-env) for setting environment variables in a cross-platform manner.

## Troubleshooting

If you encounter any issues while using this tool, please create an issue on the [GitHub repository](https://github.com/Mandy9943/commit-gen). We appreciate your feedback and will work to resolve any problems as quickly as possible.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

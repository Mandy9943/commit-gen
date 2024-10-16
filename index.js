#!/usr/bin/env node

import { execSync } from "child_process";
import { Command } from "commander";
import dotenv from "dotenv";
import fs from "fs/promises";
import Groq from "groq-sdk";
import path from "path";
import readline from "readline";
import simpleGit from "simple-git";

// Load environment variables from global .env file
dotenv.config({
  path: path.join(process.env.HOME, "projects/commit-gen/.env"),
});

const program = new Command();
const git = simpleGit();

// Use the API key from .env file
const API_KEY = process.env.GROQ_API_KEY;

if (!API_KEY) {
  console.error("Please set the GROQ_API_KEY in your .env file.");
  process.exit(1);
}

const groq = new Groq({
  apiKey: API_KEY,
});

program
  .command("g")
  .description("Generate a commit message using AI")
  .action(async () => {
    try {
      // Get the git status
      const status = await git.status();

      // Get the git diff for modified files
      const diff = await git.diff();

      // Get the content of new files
      const newFiles = await Promise.all(
        status.not_added.map(async (file) => {
          try {
            const content = await fs.readFile(file, "utf-8");
            return `New file: ${file}\n${content}`;
          } catch (error) {
            console.warn(`Unable to read file: ${file}`, error);
            return `New file: ${file}\n(Content not available)`;
          }
        })
      );

      // Combine diff and new file content
      const fullDiff = diff + "\n" + newFiles.join("\n");

      if (!fullDiff) {
        console.log("No changes detected");
        return;
      }

      console.log("Generating commit message...");

      // Use Groq API to generate commit message
      const prompt = `Generate a concise commit message for the following git changes: ${fullDiff}`;

      const chatCompletion = await groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: `You are a helpful assistant that generates git commit messages following the Conventional Commits specification.
The commit message should follow the Conventional Commits specification:

<type>[optional scope]: <description>

[body]

[optional footer(s)]

- Types: feat (new feature), fix (bug fix), docs, style, refactor, perf, test, chore, ci, build
- The description should be a short summary (50 chars or less) in present tense
- The body should provide more detailed explanations, wrapped at 72 characters
- Use BREAKING CHANGE: in the footer or ! after the type/scope for breaking changes
- Use actual line breaks instead of \n
- Do not use markdown formatting

In your response, only output the commit message, no quotes, no markdown, no code blocks, no nothing else.
              `,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        model: "llama3-70b-8192",
        temperature: 0.5,
        max_tokens: 1024,
        top_p: 1,
      });

      const commitMessage = chatCompletion.choices[0]?.message?.content || "";

      // Display the generated commit message
      console.log(`Generated Commit Message:\n${commitMessage}\n`);

      // Create a promise-based readline interface
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const askQuestion = (query) =>
        new Promise((resolve) => rl.question(query, resolve));

      try {
        const answer = await askQuestion(
          "Use this message for commit? (y/n): "
        );

        if (answer.toLowerCase() === "y") {
          // Stage all changes, including new files
          execSync("git add .");

          // Use -m option multiple times for multi-line messages
          const commitLines = commitMessage.split("\n");
          const commitCommand = `git commit ${commitLines
            .map((line) => `-m "${line}"`)
            .join(" ")}`;

          try {
            execSync(commitCommand, { stdio: "inherit" });
            console.log("Committed with AI-generated message.");
          } catch (error) {
            console.error("Error during commit:", error.message);
          }
        } else {
          console.log("Commit cancelled.");
        }
      } catch (error) {
        console.error("Error:", error);
      } finally {
        rl.close();
      }
    } catch (error) {
      console.error("Error generating commit message:", error);
    }
  });

program.parse(process.argv);

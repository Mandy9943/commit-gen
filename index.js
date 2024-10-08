#!/usr/bin/env node

import { GoogleGenerativeAI } from "@google/generative-ai";
import { execSync } from "child_process";
import { Command } from "commander";
import dotenv from "dotenv";
import fs from "fs/promises";
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
const API_KEY = process.env.GOOGLE_API_KEY;

if (!API_KEY) {
  console.error("Please set the GOOGLE_API_KEY in your .env file.");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);

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

      // Use Gemini API to generate commit message
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
      const prompt = `Generate a concise commit message for the following git changes: ${fullDiff}`;

      const result = await model.generateContent(prompt);
      const commitMessage = result.response.text();

      // Display the commit message
      console.log(`Generated Commit Message: \n${commitMessage}`);

      // Option to auto-commit with the generated message
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      rl.question("Use this message for commit? (y/n): ", (answer) => {
        if (answer.toLowerCase() === "y") {
          // Stage all changes, including new files
          execSync("git add .");
          execSync(`git commit -m "${commitMessage}"`);
          console.log("Committed with AI-generated message.");
        }
        rl.close();
      });
    } catch (error) {
      console.error("Error generating commit message:", error);
    }
  });

program.parse(process.argv);

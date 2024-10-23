#!/usr/bin/env node

import { GoogleGenerativeAI } from "@google/generative-ai";
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

// Use the API keys from .env file
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

if (!GROQ_API_KEY || !GOOGLE_API_KEY) {
  console.error(
    "Please set both GROQ_API_KEY and GOOGLE_API_KEY in your .env file."
  );
  process.exit(1);
}

const groq = new Groq({ apiKey: GROQ_API_KEY });
const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);

async function getGitChanges() {
  const status = await git.status();
  const diff = await git.diff();
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
  return diff + "\n" + newFiles.join("\n");
}

async function generateCommitMessage(fullDiff, useGroq) {
  console.log("Generating commit message...");

  if (useGroq) {
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

    return chatCompletion.choices[0]?.message?.content || "";
  } else {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    const prompt = `Generate a concise commit message for the following git changes: ${fullDiff}
The commit message should have the following format:
- First line: A brief summary of the change (50 characters or less)
- Followed by a blank line
- Then a more detailed explanation, wrapped at 72 characters
- Use actual line breaks instead of \n
- Do not use markdown formatting like ** for emphasis`;

    const result = await model.generateContent(prompt);
    return result.response.text();
  }
}

async function commitWithMessage(commitMessage) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const askQuestion = (query) =>
    new Promise((resolve) => rl.question(query, resolve));

  try {
    const answer = await askQuestion("Use this message for commit? (y/n): ");

    if (answer.toLowerCase() === "y") {
      execSync("git add .");
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
}

async function generateAndCommit(useGroq) {
  try {
    const fullDiff = await getGitChanges();
    if (!fullDiff) {
      console.log("No changes detected");
      return;
    }

    const commitMessage = await generateCommitMessage(fullDiff, useGroq);
    console.log(`Generated Commit Message:\n${commitMessage}\n`);
    await commitWithMessage(commitMessage);
  } catch (error) {
    console.error("Error generating commit message:", error);
  }
}

program
  .command("gr")
  .description("Generate a commit message using Groq AI")
  .action(() => generateAndCommit(true));

program
  .command("ge")
  .description("Generate a commit message using Google Gemini AI")
  .action(() => generateAndCommit(false));

program.parse(process.argv);

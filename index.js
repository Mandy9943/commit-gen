#!/usr/bin/env node

import { GoogleGenerativeAI } from "@google/generative-ai";
import { execSync } from "child_process";
import { Command } from "commander";
import dotenv from "dotenv";
import fs from "fs/promises";
import Groq from "groq-sdk";
import OpenAI from "openai";
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
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

if (!GROQ_API_KEY || !GOOGLE_API_KEY || !DEEPSEEK_API_KEY) {
  console.error(
    "Please set GROQ_API_KEY, GOOGLE_API_KEY, and DEEPSEEK_API_KEY in your .env file."
  );
  process.exit(1);
}

const groq = new Groq({ apiKey: GROQ_API_KEY });
const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);

// Initialize DeepSeek client
const deepseek = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: DEEPSEEK_API_KEY,
});

async function getGitChanges() {
  console.log("Fetching git changes...");
  const status = await git.status();
  const diff = await git.diff();
  console.log(
    `Found ${status.not_added.length} new files and changes in existing files`
  );

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

async function generateCommitMessage(fullDiff, model, userMessage = "") {
  console.log(
    `Using ${model.toUpperCase()} model to generate commit message...`
  );

  const role = `You are a helpful assistant that generates git commit messages following the Conventional Commits specification.

The commit message MUST follow this structure and must not exceed 100 characters in total:

<type>[scope]: <description>

[optional body]

[optional footer(s)]

Where:

1) The first line (<type>[scope]: <description>) is a short summary (50 characters or less).
   - <type> can be one of: feat, fix, docs, style, refactor, perf, test, chore, ci, build
   - The scope is optional, but if used, should be in parentheses right after the type
   - The description must be in present tense, summarizing the changes succinctly

2) Keep the entire message brief, as the total length must not exceed 100 characters

3) Use actual line breaks; do not encode them as "\n"

4) Do not include any markdown formatting

5) Return only the plain commit message text, without surrounding quotation marks or code fences
          `;

  const userGuidance = userMessage
    ? `Consider this user's description when generating the commit message: ${userMessage}\n\n`
    : "";

  if (model === "groq") {
    console.log("Sending request to Groq API...");
    const prompt = `${userGuidance}Generate a concise commit message for the following git changes: ${fullDiff}`;
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: role,
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
  } else if (model === "deepseek") {
    console.log("Sending request to DeepSeek API...");
    const prompt = `${userGuidance}Generate a concise commit message for the following git changes: ${fullDiff}`;
    const completion = await deepseek.chat.completions.create({
      messages: [
        {
          role: "system",
          content: role,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      model: "deepseek-chat",
    });

    // Clean up any markdown formatting from the response
    let message = completion.choices[0]?.message?.content || "";
    message = message.replace(/```[\s\S]*?```/g, ""); // Remove code blocks
    message = message.trim(); // Remove extra whitespace
    return message;
  } else {
    console.log("Sending request to Google Gemini API...");
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    const prompt = `${userGuidance}${role}

    Generate a concise commit message for the following git changes: ${fullDiff}`;

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
      console.log("Adding all changes to git staging...");
      execSync("git add .");
      const commitLines = commitMessage.split("\n");
      const commitCommand = `git commit ${commitLines
        .map((line) => `-m "${line}"`)
        .join(" ")}`;

      try {
        console.log("Executing git commit...");
        execSync(commitCommand, { stdio: "inherit" });
        console.log("✅ Successfully committed with AI-generated message.");
      } catch (error) {
        console.error("❌ Error during commit:", error.message);
      }
    } else {
      console.log("❌ Commit cancelled by user.");
    }
  } catch (error) {
    console.error("Error:", error);
  } finally {
    rl.close();
  }
}

async function getUserMessage() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const message = await new Promise((resolve) => {
    rl.question(
      "Enter your commit message description (optional, press Enter to skip): ",
      resolve
    );
  });

  rl.close();
  return message.trim();
}

async function generateAndCommit(model) {
  try {
    const fullDiff = await getGitChanges();
    if (!fullDiff) {
      console.log("No changes detected");
      return;
    }

    const userMessage = await getUserMessage();
    const commitMessage = await generateCommitMessage(
      fullDiff,
      model,
      userMessage
    );
    console.log(`Generated Commit Message:\n${commitMessage}\n`);
    await commitWithMessage(commitMessage);
  } catch (error) {
    console.error("Error generating commit message:", error);
  }
}

program
  .command("gr")
  .description("Generate a commit message using Groq AI")
  .action(() => generateAndCommit("groq"));

program
  .command("ge")
  .description("Generate a commit message using Google Gemini AI")
  .action(() => generateAndCommit("gemini"));

program
  .command("ds")
  .description("Generate a commit message using DeepSeek AI")
  .action(() => generateAndCommit("deepseek"));

program.parse(process.argv);

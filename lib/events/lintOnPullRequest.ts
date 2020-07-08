/*
 * Copyright © 2020 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { EventContext, EventHandler, github, project, repository, runSteps, secret, Step } from "@atomist/skill";
import * as fs from "fs-extra";
import { LintConfiguration } from "../configuration";
import { LintOnPullRequestSubscription } from "../typings/types";

interface LintParameters {
    project: project.Project;
    credential: secret.GitHubCredential | secret.GitHubAppCredential;
    start: string;
    check: github.Check;
}

type LintStep = Step<EventContext<LintOnPullRequestSubscription, LintConfiguration>, LintParameters>;

const SetupStep: LintStep = {
    name: "clone repository",
    run: async (ctx, params) => {
        const pr = ctx.data.PullRequest[0];
        const repo = pr.repo;

        await ctx.audit.log(`Starting commitlint on ${repo.owner}/${repo.name}`);

        params.credential = await ctx.credential.resolve(
            secret.gitHubAppToken({
                owner: repo.owner,
                repo: repo.name,
                apiUrl: repo.org.provider.apiUrl,
            }),
        );

        params.project = await ctx.project.clone(
            repository.gitHub({
                owner: repo.owner,
                repo: repo.name,
                credential: params.credential,
                branch: pr.branchName,
                sha: pr.head.sha,
            }),
            { alwaysDeep: false, detachHead: true },
        );
        await ctx.audit.log(`Cloned repository ${repo.owner}/${repo.name} at sha ${pr.head.sha.slice(0, 7)}`);

        params.check = await github.openCheck(ctx, params.project.id, {
            sha: pr.head.sha,
            name: ctx.skill.name,
            title: "commitlint",
            body: `Running \`commitlint\``,
        });

        return {
            code: 0,
        };
    },
};

const NpmInstallStep: LintStep = {
    name: "npm install",
    run: async (ctx, params) => {
        const opts = { env: { ...process.env, NODE_ENV: "development" } };

        if (!(await fs.pathExists(params.project.path("package.json")))) {
            await fs.writeJson(params.project.path("package.json"), {});
        }

        if (await fs.pathExists(params.project.path("package-lock.json"))) {
            await params.project.spawn("npm", ["ci"], opts);
        } else {
            await params.project.spawn("npm", ["install"], opts);
        }

        const modules = [...(ctx.configuration[0].parameters.modules || [])];

        if (!(await fs.pathExists(params.project.path("node_modules", ".bin", "commitlint")))) {
            if (!modules.includes("commitlint") && !modules.includes("@commitlint/cli")) {
                modules.push("@commitlint/cli");
            }
        }

        if (modules.length > 0) {
            await ctx.audit.log("Installing configured NPM packages");
            await params.project.spawn("npm", ["install", ...modules, "--save-dev"], opts);
            await params.project.spawn("git", ["reset", "--hard"], opts);
        }
        return {
            code: 0,
        };
    },
};

const RunCommitlintStep: LintStep = {
    name: "run commitlint",
    run: async (ctx, params) => {
        const pr = ctx.data.PullRequest[0];
        const repo = pr.repo;
        const cfg = ctx.configuration?.[0]?.parameters;
        const cmd = params.project.path("node_modules", ".bin", "commitlint");
        const args: string[] = [];

        cfg.args?.forEach(a => args.push(a));

        // Add .commitlintrc.json if missing
        const configs = await project.globFiles(params.project, ["commitlint.config.js", ".commitlintrc.*"]);
        const pj = await fs.readJson(params.project.path("package.json"));
        if (configs.length === 0 && !pj.commitlint && !!cfg.config) {
            await fs.writeFile(params.project.path(".commitlintrc.json"), cfg.config);
        }

        const argsString = args.join(" ");
        const prefix = `${params.project.path()}/`;
        await ctx.audit.log(`Running commitlint with: $ commitlint ${argsString}`);

        const output = [];
        const results = [];
        const commits = cfg.headOnly ? [pr.head] : pr.commits;

        for (const commit of commits) {
            const lines = [];
            results.push(
                await params.project.spawn("/bin/sh", ["-c", `echo "${commit.message}" | ${cmd} ${args.join(" ")}`], {
                    log: { write: msg => lines.push(msg) },
                    logCommand: false,
                }),
            );
            output.push(`---

Linting \`${commit.sha}\`
\`\`\`
${
    // prettier-ignore
    lines.join("\n").split(prefix).join("").trim()
}
\`\`\``);
        }

        if (!results.some(r => r.status !== 0)) {
            await ctx.audit.log(`commitlint returned no errors`);
            await params.check.update({
                conclusion: "success",
                body: `Running \`commitlint\` resulted in no errors.

\`$ commitlint ${argsString}\`

${output.join("\n")}`,
            });
            return {
                code: 0,
                reason: `commitlint returned no errors on [${repo.owner}/${repo.name}](${repo.url})`,
            };
        } else {
            await params.check.update({
                conclusion: "action_required",
                body: `Running \`commitlint\` raised errors.

\`$ commitlint ${argsString}\`

${output.join("\n")}`,
            });

            return {
                code: 0,
                reason: `commitlint raised [errors](${params.check.data.html_url}) on [${repo.owner}/${repo.name}](${repo.url})`,
            };
        }
    },
};

export const handler: EventHandler<LintOnPullRequestSubscription, LintConfiguration> = async ctx => {
    return runSteps({
        context: ctx,
        steps: [SetupStep, NpmInstallStep, RunCommitlintStep],
    });
};

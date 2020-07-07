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
import { LintOnPushSubscription } from "../typings/types";

interface LintParameters {
    project: project.Project;
    credential: secret.GitHubCredential | secret.GitHubAppCredential;
    start: string;
    check: github.Check;
}

type LintStep = Step<EventContext<LintOnPushSubscription, LintConfiguration>, LintParameters>;

const SetupStep: LintStep = {
    name: "clone repository",
    run: async (ctx, params) => {
        const push = ctx.data.Push[0];
        const repo = push.repo;

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
                branch: push.branch,
                sha: push.after.sha,
            }),
            { alwaysDeep: false, detachHead: false },
        );
        await ctx.audit.log(`Cloned repository ${repo.owner}/${repo.name} at sha ${push.after.sha.slice(0, 7)}`);

        params.check = await github.openCheck(ctx, params.project.id, {
            sha: push.after.sha,
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
        const push = ctx.data.Push[0];
        const repo = push.repo;
        const cfg = ctx.configuration?.[0]?.parameters;
        const cmd = params.project.path("node_modules", ".bin", "commitlint");
        const args: string[] = [];

        cfg.args?.forEach(a => args.push(a));

        // Add .commitlintrc.json if missing
        const configs = await project.globFiles(params.project, ["commitlint.config.js", ".commitlintrc.*"]);
        const pj = await fs.readJson(params.project.path("package.json"));
        if (configs.length === 0 && !pj.commitlint && !!cfg.config) {
            await fs.writeFile(".commitlintrc.json", cfg.config);
        }

        const argsString = args.join(" ").split(`${params.project.path()}/`).join("");
        await ctx.audit.log(`Running commitlint with: $ commitlint ${argsString}`);

        const lines = [];
        const results = [];

        for (const commit of push.after.pullRequests[0].commits) {
            results.push(
                await params.project.spawn("/bin/sh", ["-c", `echo "${commit.message}" | ${cmd} ${args.join(" ")}`], {
                    log: { write: msg => lines.push(msg) },
                }),
            );
        }

        if (!results.some(r => r.status !== 0)) {
            await ctx.audit.log(`commitlint returned no errors`);
            await params.check.update({
                conclusion: "success",
                body: `Running \`commitlint\` resulted in no errors.

\`$ commitlint ${argsString}\`

\`\`\`
${lines.join("\n")}
\`\`\``,
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

\`\`\`
${lines.join("\n")}
\`\`\``,
            });

            return {
                code: 0,
                reason: `commitlint raised [errors](${params.check.data.html_url}) on [${repo.owner}/${repo.name}](${repo.url})`,
            };
        }
    },
};

export const handler: EventHandler<LintOnPushSubscription, LintConfiguration> = async ctx => {
    return runSteps({
        context: ctx,
        steps: [SetupStep, NpmInstallStep, ValidateRepositoryStep, RunCommitlintStep],
    });
};

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

import {
	Category,
	LineStyle,
	parameter,
	ParameterType,
	resourceProvider,
	skill,
} from "@atomist/skill";
import { LintConfiguration } from "./lib/configuration";

export const Skill = skill<LintConfiguration & { repos: any }>({
	name: "commitlint-skill",
	namespace: "atomist",
	displayName: "commitlint",
	author: "Atomist",
	categories: [Category.CodeQuality],
	license: "Apache-2.0",

	runtime: {
		memory: 2048,
		timeout: 540,
	},

	resourceProviders: {
		github: resourceProvider.gitHub({ minRequired: 1 }),
		chat: resourceProvider.chat({ minRequired: 0 }),
	},

	parameters: {
		headOnly: {
			type: ParameterType.Boolean,
			displayName: "Check head commit only",
			description:
				"Check this if you want to only check the pull request head commit and not all commits",
			required: false,
		},
		title: {
			type: ParameterType.Boolean,
			displayName: "Check pull request title",
			description:
				"Check this if you want to check the pull request title for consistency when the pull request only contains one commit",
			required: false,
		},
		config: {
			type: ParameterType.String,
			displayName: "Configuration",
			description:
				"commitlint configuration in JSON format used if project does not contain own configuration. See the [commitlint documentation](https://commitlint.js.org/#/reference-configuration) on how to configure it.",
			lineStyle: LineStyle.Multiple,
			required: false,
		},
		args: {
			type: ParameterType.StringArray,
			displayName: "Extra arguments",
			description:
				"Additional [command line arguments](https://commitlint.js.org/#/reference-cli) passed to commitlint",
			required: false,
		},
		modules: {
			type: ParameterType.StringArray,
			displayName: "NPM packages to install",
			description:
				"Use this parameter to configure NPM packages like commitlint itself or plugins that should get installed",
			required: false,
		},
		repos: parameter.repoFilter(),
	},
});

# `atomist/commitlint-skill`

<!---atomist-skill-description:start--->

Validate commit messages using commitlint

<!---atomist-skill-description:end--->

---

<!---atomist-skill-readme:start--->

# What it's useful for

Use [commitlint](https://commitlint.js.org) to adhere to a commit convention by monitoring
commits on incoming pull requests across all of your repositories.

-   Apply the same commit conventions across all repositories without manual configuration
-   Enjoy the benefits of consistent and clear commit messages

# Before you get started

Connect and configure this integration:

-   **GitHub**
-   **Slack or Microsoft Teams**

The **GitHub** integration must be configured in order to use this skill. At least one repository must be selected.
We recommend that you configure the **Slack** or **Microsoft Teams** integration.

# How to configure

1. **Specify an optional commitlint configuration in JSON format**

    Provide the [commitlint configuration](https://commitlint.js.org/#/reference-configuration)
    in JSON format to be used for linting pull request
    commit messages.

1. **Specify optional arguments to commitlint**

    Configure optional arguments to pass to the `commitlint`
    command. See the [commitlint documentation](https://commitlint.js.org/#/reference-cli)
    for a list of available arguments.

1. **Configure commitlint packages and plugins to be installed**

    If your commitlint configuration needs special packages or plugins, use
    this parameter to specify the NPM packages that should be installed in
    addition to dependencies from the `package.json`.

1. **Determine repository scope**

    By default, this skill will be enabled for all repositories in all
    organizations you have connected.

    To restrict the organizations or specific repositories on which the skill
    will run, you can explicitly choose organization(s) and repositories.

# How to keep your commit messages consistent

1. **Configure the skill by providing a commitlint configuration**

1. **Get the commit messages validated on raised pull requests**

To create feature requests or bug reports, create an [issue in the repository for this skill](https://github.com/atomist-skills/commitlint-skill/issues).
See the [code](https://github.com/atomist-skills/commitlint-skill) for the skill.

<!---atomist-skill-readme:end--->

---

Created by [Atomist][atomist].
Need Help? [Join our Slack workspace][slack].

[atomist]: https://atomist.com/ "Atomist - How Teams Deliver Software"
[slack]: https://join.atomist.com/ "Atomist Community Slack"

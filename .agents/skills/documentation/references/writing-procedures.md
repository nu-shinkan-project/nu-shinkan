# 執筆の作例と仕上げ確認

品質要件は[執筆指示](../../../../docs/instructions/documentation/writing-documents.md)を参照する。以下は具体的な執筆を助ける例と手順であり、文書に不要な構成を強制しない。

## 用途を判定する例

| Type                | Intended use                                                                                               | Examples                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Discussion document | Help participants in the current conversation review progress, discuss options, or decide what to do next. | Status summaries, proposed implementation plans, work reports, discussion records.       |
| Reference document  | Help readers understand or perform something without access to the current conversation.                   | Tool and command guides, onboarding materials, design documents, operational procedures. |

## 構成の例

- For a guide, explain what the tool does, what is required, how to use it, and how to recognize success.
- For a design document, explain the problem and constraints, the design, and the reasons for consequential choices.

## 記述の例

For example, if the agreed procedure is to run validation before deployment:

- Avoid: "We first planned to deploy immediately, but then agreed to add validation."
- Prefer: "Run validation before deployment to catch configuration errors before they reach the deployed environment."

## 仕上げ確認

Check the following and revise any item that fails:

- Can a reader identify the document's purpose without reading the chat?
- Are necessary concepts and prerequisites introduced before they are used?
- Can the reader follow the explanation or procedure using the document and its linked references?
- Does the structure follow the reader's needs rather than the chronology of the conversation?
- Are final decisions, proposals, and unresolved questions clearly distinguished where applicable?
- Have edits been integrated without leaving contradictory or outdated statements?

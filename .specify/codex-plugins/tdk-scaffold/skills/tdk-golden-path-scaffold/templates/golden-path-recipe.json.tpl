{
  "schemaVersion": 1,
  "status": "draft",
  "preset": "{{preset}}",
  "evidence": [
    "{{evidence_path}}"
  ],
  "actions": [
    {
      "action": "mkdir",
      "path": "{{repo_relative_directory}}",
      "reason": "{{reason}}"
    },
    {
      "action": "touch-gitkeep",
      "path": "{{repo_relative_directory}}/.gitkeep",
      "reason": "Keep approved empty skeleton folder visible"
    },
    {
      "action": "write-specify-doc",
      "path": ".specify/configurations/golden-path/{{notes_file}}.md",
      "template": "golden-path-notes",
      "reason": "Record scaffold assumptions for review"
    },
    {
      "action": "write-config-template",
      "path": ".specify/templates/{{template_file}}.md",
      "template": "project-structure",
      "reason": "Provide reviewable project structure guidance"
    }
  ],
  "unresolvedQuestions": []
}

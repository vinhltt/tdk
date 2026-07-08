{
  "architecture": {
    "type": "modular-monolith",
    "boundaryType": "report-only"
  },
  "owner": "product-team",
  "contracts": ["workspace-layout-proposal-proposal"],
  "routing": {
    "next": "/tdk-workflow-config-apply"
  },
  "subWorkspaces": [
    {
      "name": "app",
      "path": "apps/app",
      "boundaryType": "application",
      "owner": "product-team",
      "contracts": ["http-api"],
      "allowedDependencies": ["shared"],
      "routing": {
        "next": "/tdk-workflow-config-apply"
      },
      "docs": {
        "path": "docs/app"
      },
      "modules": [
        {
          "name": "api",
          "path": "src/api",
          "testPath": "tests/api"
        }
      ]
    }
  ]
}

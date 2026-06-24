{
  "architecture": {
    "type": "modular-monolith",
    "boundaryType": "report-only"
  },
  "owner": "product-team",
  "contracts": ["workspace-topology-proposal"],
  "routing": {
    "next": "/tdk-workspace-topology-apply --dry-run"
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
        "next": "/tdk-workspace-topology-apply --dry-run"
      },
      "docs": {
        "path": "docs/app"
      },
      "testMapping": {
        "strategy": "mirror"
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

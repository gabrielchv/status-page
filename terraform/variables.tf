variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region for Artifact Registry and Cloud Run"
  type        = string
  default     = "us-central1"
}

variable "database_password" {
  description = "Postgres password (Cloud SQL / Neon)"
  type        = string
  sensitive   = true
}

variable "auth_secret" {
  description = "AUTH_SECRET value (long random string)"
  type        = string
  sensitive   = true
}

variable "check_runner_secret" {
  description = "CHECK_RUNNER_SECRET value (shared secret for the scheduler -> run-checks call)"
  type        = string
  sensitive   = true
}

variable "github_repo" {
  description = "GitHub repo in owner/name form, used for the WIF principal binding"
  type        = string
  default     = "gabrielchv/status-page"
}

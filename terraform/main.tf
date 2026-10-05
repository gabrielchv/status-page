provider "google" {
  project = var.project_id
  region  = var.region
}

# Terraform owns the persistent GCP resources. CI owns the app deployment:
# it builds/pushes the image and runs `gcloud run deploy`, then creates the
# Cloud Scheduler job. This mirrors the bookcerto split (Terraform = Artifact
# Registry + Secret Manager + IAM + WIF; CI = the running app).

# ---------------------------------------------------------------------------
# Artifact Registry — holds the Docker image built by CI.
# ---------------------------------------------------------------------------
resource "google_artifact_registry_repository" "app" {
  location      = var.region
  repository_id = "status-page"
  format        = "DOCKER"
}

# ---------------------------------------------------------------------------
# Secrets. Values arrive as variables; the Cloud Run service reads them at
# deploy time via `--set-secrets`.
# ---------------------------------------------------------------------------
resource "google_secret_manager_secret" "database_password" {
  secret_id = "database-password"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "database_password" {
  secret      = google_secret_manager_secret.database_password.secret_id
  secret_data = var.database_password
}

resource "google_secret_manager_secret" "auth_secret" {
  secret_id = "auth-secret"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "auth_secret" {
  secret      = google_secret_manager_secret.auth_secret.secret_id
  secret_data = var.auth_secret
}

resource "google_secret_manager_secret" "check_runner_secret" {
  secret_id = "check-runner-secret"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "check_runner_secret" {
  secret      = google_secret_manager_secret.check_runner_secret.secret_id
  secret_data = var.check_runner_secret
}

# ---------------------------------------------------------------------------
# Service accounts.
# ---------------------------------------------------------------------------
resource "google_service_account" "run" {
  account_id   = "status-page-run"
  display_name = "status-page Cloud Run execution"
}

resource "google_service_account" "deploy" {
  account_id   = "status-page-deploy"
  display_name = "status-page CI deploy"
}

# The run SA needs Cloud SQL client access to use the built-in connector.
resource "google_project_iam_member" "run_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.run.email}"
}

# The run SA reads the three secrets.
resource "google_secret_manager_secret_iam_member" "run_secret_access" {
  for_each = toset([
    google_secret_manager_secret.database_password.secret_id,
    google_secret_manager_secret.auth_secret.secret_id,
    google_secret_manager_secret.check_runner_secret.secret_id,
  ])
  secret_id = each.key
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.run.email}"
}

# The deploy SA can deploy Cloud Run services, act as the run SA, and push
# images + write secrets during `terraform apply`.
resource "google_project_iam_member" "deploy_run_admin" {
  project = var.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${google_service_account.deploy.email}"
}

resource "google_project_iam_member" "deploy_iam_user" {
  project = var.project_id
  role    = "roles/iam.serviceAccountUser"
  member  = "serviceAccount:${google_service_account.deploy.email}"
}

resource "google_project_iam_member" "deploy_ar_writer" {
  project = var.project_id
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${google_service_account.deploy.email}"
}

resource "google_project_iam_member" "deploy_secret_admin" {
  project = var.project_id
  role    = "roles/secretmanager.admin"
  member  = "serviceAccount:${google_service_account.deploy.email}"
}

resource "google_project_iam_member" "deploy_scheduler_admin" {
  project = var.project_id
  role    = "roles/cloudscheduler.admin"
  member  = "serviceAccount:${google_service_account.deploy.email}"
}

# ---------------------------------------------------------------------------
# Workload Identity Federation — lets GitHub Actions deploy without keys.
# ---------------------------------------------------------------------------
resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github-pool"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-provider"
  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.actor"      = "assertion.actor"
    "attribute.repository" = "assertion.repository"
  }
  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account_iam_member" "github_wif" {
  service_account_id = google_service_account.deploy.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repo}"
}

output "run_service_account" {
  description = "Cloud Run execution service account email (used by --service-account)"
  value       = google_service_account.run.email
}

output "deploy_service_account" {
  description = "Deploy service account email (GitHub Actions GCP_SA secret)"
  value       = google_service_account.deploy.email
}

output "wif_provider" {
  description = "WIF provider resource name (GitHub Actions WIF_PROVIDER secret)"
  value       = google_iam_workload_identity_pool_provider.github.name
}

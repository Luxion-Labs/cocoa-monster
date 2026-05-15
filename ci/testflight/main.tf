terraform {
  required_providers {
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.0"
    }
  }
}

provider "kubernetes" {
  config_path = "~/.kube/config"
}

provider "helm" {
  kubernetes {
    config_path = "~/.kube/config"
  }
}

variable "namespace" {
  description = "Ephemeral namespace for this testflight run (cocoa-monster-testflight-<short-sha>)."
  type        = string
}

variable "image_tag" {
  description = "Image tag under registry.home.sandipan.dev/cocoa-monster — pass the short-sha so each commit's image is actually rolled."
  type        = string
}

resource "helm_release" "cocoa_monster" {
  name             = "cocoa-monster"
  namespace        = var.namespace
  create_namespace = true
  chart            = "${path.module}/../../charts/cocoa-monster"
  # No subcharts on this chart — `dependency_update = true` would still
  # be a no-op, but mirror the deployments-repo pattern of keeping it
  # off so future subchart additions go through the explicit task-side
  # `helm dependency update` + tarball-extract dance.

  values = [file("${path.module}/values.yaml")]

  set {
    name  = "image.tag"
    value = var.image_tag
  }

  wait            = true
  atomic          = true
  cleanup_on_fail = true
  timeout         = 600
}

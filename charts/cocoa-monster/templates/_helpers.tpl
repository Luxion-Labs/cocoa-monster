{{/* Chart name (truncated to 63 chars, DNS-label safe). */}}
{{- define "cocoa-monster.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/* Fully-qualified release name. */}}
{{- define "cocoa-monster.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/* Chart label (name + version). */}}
{{- define "cocoa-monster.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/* Standard labels applied to every object. */}}
{{- define "cocoa-monster.labels" -}}
helm.sh/chart: {{ include "cocoa-monster.chart" . }}
app.kubernetes.io/name: {{ include "cocoa-monster.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/* Selector labels (stable across upgrades — never add version/chart here). */}}
{{- define "cocoa-monster.selectorLabels" -}}
app.kubernetes.io/name: {{ include "cocoa-monster.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

# Datadog SLO + alert monitors for Ohanafy Plan.
#
# Terraform is the canonical source — apply via:
#   terraform -chdir=monitoring init
#   terraform -chdir=monitoring apply -var="dd_api_key=..." -var="dd_app_key=..."
#
# Thresholds mirror the production SLO budget agreed in the plan:
#   - p95 copilot latency ≤ 800 ms
#   - p99 copilot latency ≤ 2000 ms
#   - median copilot cost   ≤ $0.05 per call
#   - any tool rate-limit breach in a 5-min window pages on-call
#   - any circuit-breaker trip in a 5-min window pages on-call
#
# Notifications route to #axe-a-thon via the @slack-axe-a-thon integration.

terraform {
  required_providers {
    datadog = {
      source  = "DataDog/datadog"
      version = "~> 3.40"
    }
  }
}

variable "dd_api_key" { type = string; sensitive = true }
variable "dd_app_key" { type = string; sensitive = true }
variable "slack_channel" {
  type    = string
  default = "@slack-axe-a-thon"
}

provider "datadog" {
  api_key = var.dd_api_key
  app_key = var.dd_app_key
}

resource "datadog_monitor" "copilot_latency_p95" {
  name    = "Ohanafy Plan — copilot p95 latency > 800ms"
  type    = "query alert"
  message = "p95 latency on /api/copilot breached the 800ms SLO. Check dd-trace service dashboard. ${var.slack_channel}"
  query   = "avg(last_10m):p95:ohanafy.plan.copilot.latency_ms{service:ohanafy-plan-webapp} > 800"

  monitor_thresholds {
    warning  = 600
    critical = 800
  }

  tags = ["service:ohanafy-plan-webapp", "slo:latency", "env:prod"]
}

resource "datadog_monitor" "copilot_latency_p99" {
  name    = "Ohanafy Plan — copilot p99 latency > 2000ms"
  type    = "query alert"
  message = "p99 latency on /api/copilot breached the 2s SLO. Likely upstream LLM slowness — check circuit breaker + Anthropic status. ${var.slack_channel}"
  query   = "avg(last_10m):p99:ohanafy.plan.copilot.latency_ms{service:ohanafy-plan-webapp} > 2000"

  monitor_thresholds {
    warning  = 1500
    critical = 2000
  }

  tags = ["service:ohanafy-plan-webapp", "slo:latency", "env:prod"]
}

resource "datadog_monitor" "copilot_cost_median" {
  name    = "Ohanafy Plan — copilot median cost > $0.05/call"
  type    = "query alert"
  message = "Median cost per copilot call breached the $0.05 SLO. Check prompt-size regressions or a mis-bumped PROMPT_VERSION. ${var.slack_channel}"
  query   = "avg(last_30m):median:ohanafy.plan.copilot.cost_usd{service:ohanafy-plan-webapp} > 0.05"

  monitor_thresholds {
    warning  = 0.04
    critical = 0.05
  }

  # The cost_usd metric is declared but not yet emitted (depends on the
  # end-of-Phase-1 auth sub-task that wires the agent log write). Without
  # this guard the monitor would page on "no data" continuously. Flip to
  # true once emission is live.
  notify_no_data    = false
  no_data_timeframe = 60

  tags = ["service:ohanafy-plan-webapp", "slo:cost", "env:prod"]
}

resource "datadog_monitor" "tool_rate_limit_fired" {
  name    = "Ohanafy Plan — tool rate limit breach detected"
  type    = "query alert"
  message = "A tool hit its rate limit in the last 5 minutes. Either a misbehaving caller or a limit that needs raising in Plan_Agent_Config__mdt. ${var.slack_channel}"
  query   = "sum(last_5m):sum:ohanafy.plan.tool.rate_limit_exceeded{*} > 0"

  tags = ["service:ohanafy-plan-webapp", "category:ops", "env:prod"]
}

resource "datadog_monitor" "tool_circuit_open" {
  name    = "Ohanafy Plan — circuit breaker tripped"
  type    = "query alert"
  message = "A circuit breaker is open for an external tool in the last 5 minutes. Check upstream health + the dd-trace service dashboard. ${var.slack_channel}"
  query   = "sum(last_5m):sum:ohanafy.plan.tool.circuit_open{*} > 0"

  tags = ["service:ohanafy-plan-webapp", "category:ops", "env:prod"]
}

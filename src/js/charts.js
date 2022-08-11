class Charts {
  constructor() {
    this.chartElement = document.getElementById("activityChart")

    if (!this.chartElement) return

    this.labels = ["Jan 23", "Jan 24", "Jan 25", "Jan 26", "Jan 27", "Jan 28", "Jan 29"]
    this.data = {
      labels: this.labels,
      datasets: [
        {
          type: "line",
          label: "Avg. price",
          backgroundColor: "#10B981",
          borderColor: "#10B981",
          data: [54.73, 64, 53, 96, 130, 100, 102.88]
        },
        {
          type: "bar",
          label: "Sales",
          backgroundColor: "#E7E8EC",
          data: [25, 20, 40, 130, 75, 48, 12]
        }
      ]
    }

    this.footer = tooltipItems => {
      let sum = 1
      tooltipItems.forEach(function (tooltipItem) {
        sum *= tooltipItem.parsed.y
      })
      return "Volume: " + Intl.NumberFormat("en-US", { notation: "compact" }).format(sum)
    }

    this.config = {
      data: this.data,
      options: {
        maintainAspectRatio: false,
        responsive: true,
        interaction: {
          intersect: false,
          mode: "index"
        },
        scales: {
          x: {
            // type: "time",
            // time: {
            //   unit: "week"
            // },
            grid: {
              display: false
            }
          },
          y: {
            ticks: {
              stepSize: 50
              // format: { notation: "compact" }
            }
          }
        },
        plugins: {
          legend: { display: false },
          decimation: {
            enabled: true
          },
          tooltip: {
            usePointStyle: true,
            position: "nearest",
            backgroundColor: "#131740",
            titleAlign: "center",
            bodyAlign: "center",
            footerAlign: "center",
            padding: 12,
            displayColors: false,
            yAlign: "bottom",
            callbacks: {
              footer: this.footer
            }
          }
        },
        animation: false
      }
    }

    Chart.defaults.font.size = 14
    Chart.defaults.font.family = "'DM Sans', 'Helvetica', 'Arial', sans-serif"
    Chart.defaults.color = "#5A5D79"
    Chart.defaults.borderColor = "rgba(196, 197, 207, .25)"

    this.activityChart = new Chart(this.chartElement, this.config)
  }
}

new Charts()

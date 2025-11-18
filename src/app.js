App = {
  web3Provider: null,
  contracts: {},
  account: '0x0',
  loading: false,
  contractInstance: null,

  init: async () => {
    await App.initWeb3()
    await App.initContracts()
    await App.render()
    if (window.web3 && web3.eth) {
      try { web3.eth.defaultAccount = App.account } catch (e) {}
    }
  },

  // https://medium.com/metamask/https-medium-com-metamask-breaking-change-injecting-web3-7722797916a8
  initWeb3: async () => {
    // Modern dapp browsers
    if (window.ethereum) {
      App.web3Provider = window.ethereum
      window.web3 = new Web3(window.ethereum)
      try {
        // Request account access if needed
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
        App.account = accounts[0]
        // Listen for account changes
        if (window.ethereum.on) {
          window.ethereum.on('accountsChanged', function (accounts) {
            App.account = accounts[0] || App.account
            App.render()
          })
          window.ethereum.on('chainChanged', function (_chainId) {
            // reload page on network change
            window.location.reload()
          })
        }
      } catch (error) {
        console.error('User denied account access', error)
      }
    }
    // Legacy dapp browsers
    else if (window.web3) {
      App.web3Provider = window.web3.currentProvider
      window.web3 = new Web3(window.web3.currentProvider)
      try {
        const accounts = await web3.eth.getAccounts()
        App.account = accounts[0]
      } catch (e) {}
    }
    // Non-dapp browsers
    else {
      console.log('Non-Ethereum browser detected. You should consider trying MetaMask!')
      // still create a Web3 instance to avoid breaking UI (will be read-only)
      App.web3Provider = null
    }
  },

  initContracts: async () => {
    // Load MyContract
    try {
      const myContractJson = await $.getJSON('MyContract.json')
      App.contracts.MyContract = TruffleContract(myContractJson)
      App.contracts.MyContract.setProvider(App.web3Provider)
    } catch (e) {
      console.error('Could not load MyContract.json', e)
    }
    // Load MoneyManagement (if present)
    try {
      const moneyJson = await $.getJSON('MoneyManagement.json')
      App.contracts.MoneyManagement = TruffleContract(moneyJson)
      App.contracts.MoneyManagement.setProvider(App.web3Provider)
    } catch (e) {
      // It's OK if this contract isn't present in the build folder
      console.warn('MoneyManagement.json not found in build/contracts, skipping')
    }
  },

  render: async () => {
    // Prevent double render
    if (App.loading) {
      return
    }

    // Update app loading state
    App.setLoading(true)

    // Set the current blockchain account
    try {
      const accounts = await web3.eth.getAccounts()
      App.account = accounts && accounts.length > 0 ? accounts[0] : App.account
    } catch (e) {
      // ignore
    }
    // Navbar / header account
  $('#accountAddress').html(App.account)
  // ownerAccount will be populated when contract owner is read (so it shows actual owner)

    // Highlight active nav link based on filename
    try {
      const path = window.location.pathname.split('/').pop()
      $('.nav li a').removeClass('active')
      if (path === '' || path === 'index.html') {
        $('.nav li a[href="index.html"]').addClass('active')
      } else if (path === 'tenant.html') {
        $('.nav li a[href="tenant.html"]').addClass('active')
      } else if (path === 'history.html') {
        $('.nav li a[href="history.html"]').addClass('active')
      }
    } catch (e) { }

    // Load MyContract and use it for rentalLocation if available
    try {
      if (App.contracts.MyContract) {
        const myInstance = await App.contracts.MyContract.deployed()
        App.myContract = myInstance
        try {
          const location = await App.myContract.get()
          // If contract returns an empty or default value, keep a friendly label
          $('#rentalLocation').html(location || 'N/A')
        } catch (e) {
          $('#rentalLocation').html('N/A')
        }
      }
    } catch (e) {
      console.warn('MyContract not deployed or could not be read', e)
      $('#rentalLocation').html('Narayanguda') // demo fallback to match video screenshot
    }

    // Load MoneyManagement (if deployed) to populate contract address, tenant and payments
    try {
      if (App.contracts.MoneyManagement) {
        const moneyInstance = await App.contracts.MoneyManagement.deployed()
        App.moneyContract = moneyInstance
        $('#contractDeployed').html(moneyInstance.address)

        try {
          const ownerAddr = await moneyInstance.owner()
          if (ownerAddr) $('#ownerAccount').html(ownerAddr)

          // Use location-centric API: render differently for owner and tenant pages
          const path = window.location.pathname.split('/').pop()
          const role = sessionStorage.getItem('selectedRole') || null

          // Show role modal if not selected yet
          if (!role) {
            $('#roleModal').show()
            $('#selectOwner').off('click').on('click', () => { sessionStorage.setItem('selectedRole', 'owner'); $('#roleModal').hide(); App.render() })
            $('#selectTenant').off('click').on('click', () => { sessionStorage.setItem('selectedRole', 'tenant'); $('#roleModal').hide(); App.render() })
          } else {
            $('#roleModal').hide()
          }

          // Hide nav entries based on role (owner shouldn't see tenant add buttons etc.)
          if (role === 'owner') {
            $('.nav li a[href="tenant.html"]').hide()
          } else if (role === 'tenant') {
            $('.nav li a[href="index.html"]').hide()
          } else {
            // show all if no role selected
            $('.nav li a').show()
          }

          // If on owner page: render locations list
          if (path === '' || path === 'index.html') {
            const count = parseInt((await moneyInstance.getLocationCount()).toString())
            const container = $('#tenantListContainer')
            container.html('')
            if (count === 0) {
              container.html('<p>No locations created.</p>')
            } else {
              let table = '<table style="width:100%"><thead><tr><th>#</th><th>Location</th><th>Tenant</th><th>Rent (ETH)</th><th>Days Left</th><th>Actions</th></tr></thead><tbody>'
              for (let i = 0; i < count; i++) {
                const t = await moneyInstance.getLocation(i)
                const name = t[0]; const rent = t[1]; const tenant = t[2]; const ownerSigned = t[3]; const tenantSigned = t[4]; const lastPaid = t[5]; const active = t[6]
                const rentEth = web3.utils.fromWei(rent.toString(), 'ether')
                const daysLeft = computeDaysLeftWithPrepay(i, lastPaid)
                const tenantDisplay = (!tenant || tenant === '0x0000000000000000000000000000000000000000') ? '-' : tenant
                const actions = []
                actions.push(`<button class="btn-terminate small" data-id="${i}">Terminate</button>`)
                if (!tenant || tenant === '0x0000000000000000000000000000000000000000') {
                  actions.push(`<button class="btn-assign small" data-id="${i}">Assign</button>`)
                }
                table += `<tr><td>${i+1}</td><td>${name}</td><td>${tenantDisplay}</td><td>${rentEth}</td><td>${daysLeft}</td><td>${actions.join(' ')}</td></tr>`
              }
              table += '</tbody></table>'
              container.html(table)
              $('.btn-terminate.small').off('click').on('click', async function(){
                const id = $(this).data('id')
                try { await moneyInstance.terminateLocation(id, { from: App.account }); App.render() } catch (err) { alert('Terminate failed: '+(err.message||err)) }
              })
              $('.btn-assign.small').off('click').on('click', async function(){
                const id = $(this).data('id')
                const addr = window.prompt('Enter tenant address to assign to location #' + (id+1))
                if (!addr) return
                try { await moneyInstance.assignTenant(id, addr, { from: App.account }); App.render() } catch (err) { alert('Assign failed: '+(err.message||err)) }
              })
            }
          }

          // If on tenant page: find locations assigned to current account and prefills
          if (path === 'tenant.html') {
            const count = parseInt((await moneyInstance.getLocationCount()).toString())
            let found = false
            for (let i = 0; i < count; i++) {
              const t = await moneyInstance.getLocation(i)
              const name = t[0]; const rent = t[1]; const tenant = t[2]; const lastPaid = t[5]
              if (tenant && tenant.toLowerCase() === App.account.toLowerCase()) {
                found = true
                $('#tenantAddressInput').val(App.account)
                $('#rentalLocation').html(name)
                $('#rentCost').html(web3.utils.fromWei(rent.toString(),'ether') + ' Ethers')
                if (!$('#amount').val()) { $('#amount').val(web3.utils.fromWei(rent.toString(),'ether')) }
                // Save location id on the form for pay handler
                $('#payRentForm').data('locationId', i)
                // show days left
                const daysLeft = computeDaysLeftWithPrepay(i, lastPaid)
                if (!$('#daysLeft').length) { $('.tenant-form-box').append(`<p id="daysLeft">Days left: ${daysLeft}</p>`) } else { $('#daysLeft').text('Days left: ' + daysLeft) }
                break
              }
            }
            if (!found) {
              $('#tenantAddressInput').val(App.account)
              $('#rentalLocation').html('No tenant record')
            }
          }
        } catch (err) {
          console.error('Error handling tenants', err)
        }

        // Try to read past RentPaid events and show the last one
        try {
          if (typeof moneyInstance.getPastEvents === 'function') {
            const events = await moneyInstance.getPastEvents('RentPaid', { fromBlock: 0, toBlock: 'latest' })
            if (events && events.length > 0) {
              const last = events[events.length - 1]
              const payer = last.returnValues && last.returnValues.tenant ? last.returnValues.tenant : last.returnValues[0]
              const amount = last.returnValues && last.returnValues.amount ? last.returnValues.amount : last.returnValues[2]
              $('#lastPayment').html((amount ? web3.utils.fromWei(amount.toString(), 'ether') + ' Ethers from ' : '') + (payer || 'Unknown'))
            } else {
              $('#lastPayment').html('No payments yet')
            }

            // Populate history table (if exists on page)
            try {
              if ($('#historyTable').length) {
                const tbody = $('#historyTable tbody')
                tbody.html('')
                for (let i = 0; i < events.length; i++) {
                  const ev = events[i]
                  const from = ev.returnValues && (ev.returnValues.tenant || ev.returnValues[0])
                  const amount = ev.returnValues && (ev.returnValues.amount || ev.returnValues[2])
                  let ts = ev.returnValues && ev.returnValues.timestamp ? ev.returnValues.timestamp : null
                  let txh = ev.transactionHash || null
                  let timeDisplay = ''
                  if (ts) {
                    const d = new Date(parseInt(ts.toString()) * 1000)
                    timeDisplay = d.toLocaleString()
                  } else if (ev.blockNumber) {
                    try { const block = await web3.eth.getBlock(ev.blockNumber); const d = new Date(parseInt(block.timestamp) * 1000); timeDisplay = d.toLocaleString() } catch (e) { timeDisplay = 'Unknown' }
                  }
                  tbody.append(`<tr><td>${i+1}</td><td>${from}</td><td>${web3.utils.fromWei(amount.toString(), 'ether')}</td><td>${timeDisplay}</td><td>${txh || ''}</td></tr>`)
                }
              }
            } catch (e) { /* ignore history render errors */ }

          } else {
            $('#lastPayment').html('No payment history')
          }
        } catch (e) {
          console.warn('Could not read past events', e)
          $('#lastPayment').html('No payment history')
        }
      } else {
        // No MoneyManagement contract available - show demo values
        $('#contractDeployed').html('0x6Df963EF0e9d9cF6A0bd195DB9bD0325A893ad52')
        $('#tenantAddress').html('0x0000000000000000000000000000000000000000')
        $('#rentCost').html('10 Ethers')
        $('#lastPayment').html('Unix Time-Stamp:1573889781')
      }
    } catch (e) {
      console.error('Error while loading MoneyManagement contract', e)
      $('#contractDeployed').html('Not deployed')
      $('#tenantAddress').html('Not available')
      $('#rentCost').html('10 Ethers')
      $('#lastPayment').html('No payments yet')
    }

    // Bind tenant payment form (if exists)
    try {
      if ($('#payRentForm').length && App.moneyContract) {
        $('#payRentForm').off('submit').on('submit', async (ev) => {
          ev.preventDefault()
          $('#paymentProgress').show()
          try {
            const amountEth = ($('#amount').val() || '0').toString()
            const value = web3.utils.toWei(amountEth, 'ether')
            // determine location id saved earlier by render
            const locId = $('#payRentForm').data('locationId')
            if (typeof locId === 'undefined') { alert('No location selected for this tenant'); $('#paymentProgress').hide(); return }

            // Fetch location details to check signing status
            const loc = await App.moneyContract.getLocation(locId)
            const tenantAddr = loc[2]
            const ownerSigned = loc[3]
            const tenantSigned = loc[4]
            const lastPaid = loc[5]

            if (!tenantAddr || tenantAddr.toLowerCase() !== App.account.toLowerCase()) {
              alert('You are not the assigned tenant for this location')
              $('#paymentProgress').hide()
              return
            }

            if (!ownerSigned) {
              alert('Owner has not approved this location yet. Cannot pay until owner approves.')
              $('#paymentProgress').hide()
              return
            }

            // If tenant hasn't signed yet, sign first (separate transaction)
            if (!tenantSigned) {
              $('#paymentProgress').html('Signing contract as tenant...')
              try {
                await App.moneyContract.tenantSign(locId, { from: App.account })
              } catch (err) {
                console.error('Tenant sign failed', err)
                alert('Could not sign contract: ' + (err.message || err))
                $('#paymentProgress').hide()
                return
              }
            }

            // Before paying, store current remaining days so paying early can extend remaining days
            try {
              const preRemaining = computeDaysLeft(lastPaid)
              const nowSec = Math.floor(Date.now() / 1000)
              sessionStorage.setItem('prepay_' + locId, JSON.stringify({ remaining: preRemaining, ts: nowSec }))
            } catch (e) { /* ignore */ }

            $('#paymentProgress').html('Sending payment transaction...')
            // call payRent via contract with id
            const tx = await App.moneyContract.payRent(locId, { from: App.account, value })
            // tx.tx contains tx hash when using truffle-contract
            const txHash = (tx && tx.tx) ? tx.tx : (tx.txHash || null)
            if (txHash) {
              $('#paymentProgress').html('Transaction sent: ' + txHash)
            }
            // wait for receipt via web3
            if (txHash) {
              web3.eth.getTransactionReceipt(txHash, (err, receipt) => {
                if (receipt) {
                  $('#paymentProgress').html('Transaction confirmed: ' + txHash)
                  setTimeout(() => App.render(), 1000)
                }
              })
            } else {
              // fallback: re-render after short delay
              setTimeout(() => App.render(), 1500)
            }
          } catch (err) {
            console.error('Payment failed', err)
            alert('Payment failed: ' + (err.message || err))
          }
          setTimeout(() => { $('#paymentProgress').hide(); $('#paymentProgress').html('Progressing...') }, 3500)
        })
      }
    } catch (e) { /* ignore */ }

    // Global termination removed in new contract; per-tenant termination handled in owner tenant list

    // Bind owner create location form
    try {
      if ($('#addTenantForm').length && App.moneyContract) {
        $('#addTenantForm').off('submit').on('submit', async (ev) => {
          ev.preventDefault()
          const addr = $('#tenantAddress').val() || ''
          const location = $('#tenantLocation').val() || ''
          const monthly = ($('#tenantMonthly').val() || '0').toString()
          $('#addTenantStatus').show().text('Sending...')
            try {
            const monthlyWei = web3.utils.toWei(monthly, 'ether')
            // create location first (new signature: createLocation(name, monthlyRent))
            const createTx = await App.moneyContract.createLocation(location, monthlyWei, { from: App.account })
            // if an address was provided, assign tenant to the newly created location
            if (addr && addr.length > 0) {
              // determine new id (locations are appended)
              const newId = parseInt((await App.moneyContract.getLocationCount()).toString()) - 1
              await App.moneyContract.assignTenant(newId, addr, { from: App.account })
            }
            $('#addTenantStatus').text('Location created. Refreshing...')
            setTimeout(() => App.render(), 1200)
          } catch (err) {
            console.error('Create location failed', err)
            $('#addTenantStatus').text('Failed: ' + (err.message || err))
          }
          setTimeout(() => $('#addTenantStatus').hide(), 3000)
        })
      }
    } catch (e) { /* ignore */ }

    // Helper: compute days left assuming a 30-day rent period. lastPaid: unix timestamp (seconds)
    function computeDaysLeft(lastPaid) {
      try {
        const SECONDS_30_DAYS = 30 * 24 * 60 * 60 // 2592000
        const nowSec = Math.floor(Date.now() / 1000)
        if (!lastPaid || lastPaid == 0) {
          // never paid -> due in 30 days from now
          return 30
        }
        const last = parseInt(lastPaid.toString())
        const nextDue = last + SECONDS_30_DAYS
        const diffSec = nextDue - nowSec
        const diffDays = Math.ceil(diffSec / (24 * 60 * 60))
        return diffDays > 0 ? diffDays : 0
      } catch (e) { return 'N/A' }
    }

    // Compute days left taking into account any prepay data saved before sending payment.
    function computeDaysLeftWithPrepay(locId, lastPaid) {
      try {
        // check for prepay data saved for this location
        const key = 'prepay_' + locId
        const raw = sessionStorage.getItem(key)
        if (raw) {
          try {
            const obj = JSON.parse(raw)
            const preRemaining = parseInt(obj.remaining || 0)
            const savedTs = parseInt(obj.ts || 0)
            const last = lastPaid && lastPaid != 0 ? parseInt(lastPaid.toString()) : 0
            const nowSec = Math.floor(Date.now() / 1000)
            // If payment was recorded (lastPaid >= savedTs) then the new remaining period begins at lastPaid
            if (last >= savedTs && last > 0) {
              // new remaining days = preRemaining + 30 - elapsedDaysSincePayment
              const elapsedSincePaymentSec = nowSec - last
              const elapsedDays = Math.floor(elapsedSincePaymentSec / (24 * 60 * 60))
              const total = preRemaining + 30 - elapsedDays
              // clear prepay entry once applied
              try { sessionStorage.removeItem(key) } catch (e) {}
              return total > 0 ? total : 0
            }
            // If lastPaid not yet updated on-chain, fall back to computeDaysLeft(lastPaid)
          } catch (e) {
            // parsing error - fall back
          }
        }
        return computeDaysLeft(lastPaid)
      } catch (e) { return 'N/A' }
    }

    App.setLoading(false)
  },

  set: async () => {
    App.setLoading(true)

    const newValue = $('#newValue').val()

    await App.contractInstance.set(newValue)
    window.alert('Value updated! Refresh this page to see the new value (it might take a few seconds).')
  },

  setLoading: (boolean) => {
    App.loading = boolean
    const loader = $('#loader')
    const content = $('#content')
    if (boolean) {
      loader.show()
      content.hide()
    } else {
      loader.hide()
      content.show()
    }
  }
}

$(() => {
  $(window).load(() => {
    App.init()
  })
})
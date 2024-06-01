const TestRegistrar = artifacts.require('./registry/TestRegistrar.sol')
const ENS = artifacts.require('./registry/FNSRegistry.sol')

const { exceptions, evm } = require('../test-utils')
const namehash = require('eth-ens-namehash')
const sha3 = require('web3-utils').sha3

const FRAXTAL_DEL_REG = '0x098c837FeF2e146e96ceAF58A10F68Fc6326DC4C'
const FRAXTAL_INITIAL_DEL = '0x93bC2E4061D4B256EB55446952B49C616db4ac0e'

contract('TestRegistrar', function (accounts) {
  let node
  let registrar, ens

  beforeEach(async () => {
    node = namehash.hash('frax')

    ens = await ENS.new(FRAXTAL_DEL_REG, FRAXTAL_INITIAL_DEL)
    registrar = await TestRegistrar.new(ens.address, '0x0')

    await ens.setOwner('0x0', registrar.address, { from: accounts[0] })
  })

  it('registers names', async () => {
    await registrar.register(sha3('frax'), accounts[0], { from: accounts[0] })
    assert.equal(await ens.owner('0x0'), registrar.address)
    assert.equal(await ens.owner(node), accounts[0])
  })

  it('forbids transferring names within the test period', async () => {
    await registrar.register(sha3('frax'), accounts[1], { from: accounts[0] })
    await exceptions.expectFailure(
      registrar.register(sha3('frax'), accounts[0], { from: accounts[0] }),
    )
  })

  it('allows claiming a name after the test period expires', async () => {
    await registrar.register(sha3('frax'), accounts[1], { from: accounts[0] })
    assert.equal(await ens.owner(node), accounts[1])

    await evm.advanceTime(28 * 24 * 60 * 60 + 1)

    await registrar.register(sha3('frax'), accounts[0], { from: accounts[0] })
    assert.equal(await ens.owner(node), accounts[0])
  })
})

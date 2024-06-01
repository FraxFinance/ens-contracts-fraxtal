const FIFSRegistrar = artifacts.require('./ethregistrar/FIFSRegistrar.sol')
const ENS = artifacts.require('./registry/FNSRegistry.sol')

const { exceptions } = require('../test-utils')
const sha3 = require('web3-utils').sha3
const namehash = require('eth-ens-namehash')

const FRAXTAL_DEL_REG = '0x098c837FeF2e146e96ceAF58A10F68Fc6326DC4C'
const FRAXTAL_INITIAL_DEL = '0x93bC2E4061D4B256EB55446952B49C616db4ac0e'

contract('FIFSRegistrar', function (accounts) {
  let registrar, ens

  beforeEach(async () => {
    ens = await ENS.new(FRAXTAL_DEL_REG, FRAXTAL_INITIAL_DEL)
    registrar = await FIFSRegistrar.new(ens.address, '0x0')

    await ens.setOwner('0x0', registrar.address, { from: accounts[0] })
  })

  it('should allow registration of names', async () => {
    await registrar.register(sha3('frax'), accounts[0], { from: accounts[0] })
    assert.equal(await ens.owner('0x0'), registrar.address)
    assert.equal(await ens.owner(namehash.hash('frax')), accounts[0])
  })

  describe('transferring names', async () => {
    beforeEach(async () => {
      await registrar.register(sha3('frax'), accounts[0], { from: accounts[0] })
    })

    it('should allow transferring name to your own', async () => {
      await registrar.register(sha3('frax'), accounts[1], { from: accounts[0] })
      assert.equal(await ens.owner(namehash.hash('frax')), accounts[1])
    })

    it('forbids transferring the name you do not own', async () => {
      await exceptions.expectFailure(
        registrar.register(sha3('frax'), accounts[1], { from: accounts[1] }),
      )
    })
  })
})

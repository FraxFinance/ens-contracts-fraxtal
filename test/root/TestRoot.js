const Root = artifacts.require('./Root.sol')
const ENS = artifacts.require('@ensdomains/ens/contracts/FNSRegistry.sol')

const { exceptions, evm } = require('@ensdomains/test-utils')
const namehash = require('eth-ens-namehash')
const sha3 = require('js-sha3').keccak_256

const FRAXTAL_DEL_REG = '0x098c837FeF2e146e96ceAF58A10F68Fc6326DC4C'
const FRAXTAL_INITIAL_DEL = '0x93bC2E4061D4B256EB55446952B49C616db4ac0e'

contract('Root', function (accounts) {
  let node
  let ens, root

  let now = Math.round(new Date().getTime() / 1000)

  beforeEach(async function () {
    node = namehash.hash('eth')

    ens = await ENS.new(FRAXTAL_DEL_REG, FRAXTAL_INITIAL_DEL)
    root = await Root.new(ens.address)

    await root.setController(accounts[0], true)
    await ens.setSubnodeOwner('0x0', '0x' + sha3('eth'), root.address, {
      from: accounts[0],
    })
    await ens.setOwner('0x0', root.address)
  })

  describe('setSubnodeOwner', async () => {
    it('should allow controllers to set subnodes', async () => {
      await root.setSubnodeOwner('0x' + sha3('eth'), accounts[1], {
        from: accounts[0],
      })
      assert.equal(accounts[1], await ens.owner(node))
    })

    it('should fail when non-controller tries to set subnode', async () => {
      await exceptions.expectFailure(
        root.setSubnodeOwner('0x' + sha3('eth'), accounts[1], {
          from: accounts[1],
        }),
      )
    })

    it('should not allow setting a locked TLD', async () => {
      await root.lock('0x' + sha3('eth'))
      await exceptions.expectFailure(
        root.setSubnodeOwner('0x' + sha3('eth'), accounts[1], {
          from: accounts[0],
        }),
      )
    })
  })
})

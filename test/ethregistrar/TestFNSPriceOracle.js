const DummyOracle = artifacts.require('./DummyOracle')
const FNSPriceOracle = artifacts.require('./FNSPriceOracle')

const { expect } = require('chai')

const FRAXTAL_DEL_REG = '0x098c837FeF2e146e96ceAF58A10F68Fc6326DC4C'
const FRAXTAL_INITIAL_DEL = '0x93bC2E4061D4B256EB55446952B49C616db4ac0e'

contract('FNSPriceOracle', function (accounts) {
  let priceOracle

  before(async () => {
    // Dummy oracle with 1 ETH == 10 USD
    var dummyOracle = await DummyOracle.new(1000000000n)
    // 4 attousd per second for 3 character names, 2 attousd per second for 4 character names,
    // 1 attousd per second for longer names.
    priceOracle = await FNSPriceOracle.new(
      [0, 0, 4, 2, 1],
      FRAXTAL_DEL_REG,
      FRAXTAL_INITIAL_DEL,
    )
  })

  it('should return correct prices', async () => {
    expect(parseInt((await priceOracle.price('foo', 0, 3600)).base)).to.equal(
      14400,
    )
    expect(parseInt((await priceOracle.price('quux', 0, 3600)).base)).to.equal(
      7200,
    )
    expect(parseInt((await priceOracle.price('fubar', 0, 3600)).base)).to.equal(
      3600,
    )
    expect(
      parseInt((await priceOracle.price('foobie', 0, 3600)).base),
    ).to.equal(3600)
  })

  it('should work with larger values', async () => {
    const dummyOracle2 = await DummyOracle.new(1000000000n)
    // 4 attousd per second for 3 character names, 2 attousd per second for 4 character names,
    // 1 attousd per second for longer names.
    const priceOracle2 = await FNSPriceOracle.new(
      [
        0,
        0,
        // 1 USD per second!
        1000000000000000000n,
        2,
        1,
      ],
      FRAXTAL_DEL_REG,
      FRAXTAL_INITIAL_DEL,
    )
    expect((await priceOracle2.price('foo', 0, 86400))[0].toString()).to.equal(
      '86400000000000000000000',
    )
  })
})

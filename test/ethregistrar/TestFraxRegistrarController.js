const {
  evm,
  reverse: { getReverseNode },
  contracts: { deploy },
  ens: { FUSES },
} = require('../test-utils')

const { CANNOT_UNWRAP, PARENT_CANNOT_CONTROL, IS_DOT_ETH } = FUSES

const { expect } = require('chai')

const { ethers } = require('hardhat')
const provider = ethers.provider
const { namehash } = require('../test-utils/ens')
const sha3 = require('web3-utils').sha3
const {
  EMPTY_BYTES32: EMPTY_BYTES,
  EMPTY_ADDRESS: ZERO_ADDRESS,
} = require('../test-utils/constants')

const FRAXTAL_DEL_REG = '0x098c837FeF2e146e96ceAF58A10F68Fc6326DC4C'
const FRAXTAL_INITIAL_DEL = '0x93bC2E4061D4B256EB55446952B49C616db4ac0e'
const DAY = 24 * 60 * 60
const REGISTRATION_TIME = 28 * DAY
const BUFFERED_REGISTRATION_COST = REGISTRATION_TIME + 3 * DAY

const GRACE_PERIOD = 90 * DAY
const NULL_ADDRESS = ZERO_ADDRESS
contract('FraxRegistrarController', function () {
  let ens
  let resolver
  let resolver2 // resolver signed by accounts[1]
  let baseRegistrar
  let controller
  let controller2 // controller signed by accounts[1]
  let priceOracle
  let reverseRegistrar
  let nameWrapper
  let callData
  let fxs
  let fxs2 // fxs signed by accounts[1]

  const secret =
    '0x0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF'
  let ownerAccount // Account that owns the registrar
  let registrantAccount // Account that owns test names
  let accounts = []

  async function registerName(name) {
    var commitment = await controller.makeCommitment(
      name,
      registrantAccount,
      REGISTRATION_TIME,
      secret,
      NULL_ADDRESS,
      [],
      false,
      0,
    )
    var tx = await controller.commit(commitment)
    expect(await controller.commitments(commitment)).to.equal(
      (await provider.getBlock(tx.blockNumber)).timestamp,
    )
    var { base, premium } = await controller.rentPrice(name, REGISTRATION_TIME)
    var price = (Number(base) + Number(premium)).toString()
    await fxs.approve(controller.address, price)

    await evm.advanceTime((await controller.minCommitmentAge()).toNumber())

    var tx = await controller.register(
      name,
      registrantAccount,
      REGISTRATION_TIME,
      secret,
      NULL_ADDRESS,
      [],
      false,
      0,
    )
    // console.log(tx.from,tx.to)
    // console.log('controller: ',controller.address)
    // console.log('registrantAccount: ',registrantAccount)
    // console.log('ownerAccount: ',ownerAccount)
    return tx
  }

  before(async () => {
    signers = await ethers.getSigners()
    ownerAccount = await signers[0].getAddress()
    registrantAccount = await signers[1].getAddress()
    accounts = [ownerAccount, registrantAccount, signers[2].getAddress()]
    fxs = await deploy('MockERC20', 'Frax Share', 'FXS', [])
    fxs2 = fxs.connect(signers[1])
    await fxs.transfer(registrantAccount, '20000000000000000000')
    ens = await deploy('FNSRegistry', FRAXTAL_DEL_REG, FRAXTAL_INITIAL_DEL)

    baseRegistrar = await deploy(
      'FNSBaseRegistrarImplementation',
      ens.address,
      namehash('frax'),
      FRAXTAL_DEL_REG,
      FRAXTAL_INITIAL_DEL,
    )

    reverseRegistrar = await deploy('ReverseRegistrar', ens.address)

    await ens.setSubnodeOwner(EMPTY_BYTES, sha3('reverse'), accounts[0])
    await ens.setSubnodeOwner(
      namehash('reverse'),
      sha3('addr'),
      reverseRegistrar.address,
    )

    nameWrapper = await deploy(
      'FNSNameWrapper',
      ens.address,
      baseRegistrar.address,
      ownerAccount,
      FRAXTAL_DEL_REG,
      FRAXTAL_INITIAL_DEL,
    )

    await ens.setSubnodeOwner(EMPTY_BYTES, sha3('frax'), baseRegistrar.address)

    const dummyOracle = await deploy('DummyOracle', '100000000')
    priceOracle = await deploy(
      'FNSPriceOracle',
      [
        31709791984000, 6341958397000, 3170979198400, 634195839700,
        317097919840,
      ],
      FRAXTAL_DEL_REG,
      FRAXTAL_INITIAL_DEL,
    )
    controller = await deploy(
      'FraxRegistrarController',
      baseRegistrar.address,
      priceOracle.address,
      600,
      86400,
      reverseRegistrar.address,
      nameWrapper.address,
      ens.address,
      fxs.address,
    )
    controller2 = controller.connect(signers[1])
    await nameWrapper.setController(controller.address, true)
    await baseRegistrar.addController(nameWrapper.address)
    await reverseRegistrar.setController(controller.address, true)

    resolver = await deploy(
      'PublicResolver',
      ens.address,
      nameWrapper.address,
      controller.address,
      reverseRegistrar.address,
    )

    callData = [
      resolver.interface.encodeFunctionData('setAddr(bytes32,address)', [
        namehash('newconfigname.frax'),
        registrantAccount,
      ]),
      resolver.interface.encodeFunctionData('setText', [
        namehash('newconfigname.frax'),
        'url',
        'frax.com',
      ]),
    ]

    resolver2 = await resolver.connect(signers[1])
  })

  beforeEach(async () => {
    result = await ethers.provider.send('evm_snapshot')
  })
  afterEach(async () => {
    await ethers.provider.send('evm_revert', [result])
  })

  const checkLabels = {
    testing: true,
    longname12345678: true,
    sixsix: true,
    five5: true,
    four: true,
    iii: true,
    ii: false,
    i: false,
    '': false,

    // { ni } { hao } { ma } (chinese; simplified)
    你好吗: true,

    // { ta } { ko } (japanese; hiragana)
    たこ: false,

    // { poop } { poop } { poop } (emoji)
    '\ud83d\udca9\ud83d\udca9\ud83d\udca9': true,

    // { poop } { poop } (emoji)
    '\ud83d\udca9\ud83d\udca9': false,
  }

  it('should report label validity', async () => {
    for (const label in checkLabels) {
      expect(await controller.valid(label)).to.equal(checkLabels[label], label)
    }
  })

  it('should report unused names as available', async () => {
    expect(await controller.available(sha3('available'))).to.equal(true)
  })

  it('should permit new registrations', async () => {
    const name = 'newname'
    const balanceBefore = await fxs.balanceOf(controller.address)
    var { base, premium } = await controller.rentPrice(name, REGISTRATION_TIME)
    var price = (Number(base) + Number(premium)).toString()
    const tx = await registerName(name)
    const block = await provider.getBlock(tx.blockNumber)
    await expect(tx)
      .to.emit(controller, 'NameRegistered')
      .withArgs(
        name,
        sha3(name),
        registrantAccount,
        base.toString(),
        premium.toString(),
        block.timestamp + REGISTRATION_TIME,
      )
    expect((await fxs.balanceOf(controller.address)) - balanceBefore).to.equal(
      Number(price),
    )
  })

  it('should revert when not enough payToken is owned', async () => {
    var balance = await fxs.balanceOf(ownerAccount)
    fxs.transfer(registrantAccount, balance.toString())
    await expect(registerName('newname')).to.be.revertedWith(
      'InsufficientBalance()',
    )
  })

  it('should report registered names as unavailable', async () => {
    const name = 'newname'
    await registerName(name)
    expect(await controller.available(name)).to.equal(false)
  })

  it('should permit new registrations with resolver and records', async () => {
    var commitment = await controller2.makeCommitment(
      'newconfigname',
      registrantAccount,
      REGISTRATION_TIME,
      secret,
      resolver.address,
      callData,
      false,
      0,
    )
    var tx = await controller2.commit(commitment)

    expect(await controller2.commitments(commitment)).to.equal(
      (await web3.eth.getBlock(tx.blockNumber)).timestamp,
    )

    await evm.advanceTime((await controller2.minCommitmentAge()).toNumber())

    var balanceBefore = await fxs.balanceOf(controller.address)

    var { base, premium } = await controller.rentPrice(
      'newconfigname',
      REGISTRATION_TIME,
    )
    var price = (Number(base) + Number(premium)).toString()

    await fxs2.approve(controller.address, price)
    var tx = await controller2.register(
      'newconfigname',
      registrantAccount,
      REGISTRATION_TIME,
      secret,
      resolver.address,
      callData,
      false,
      0,
    )

    const block = await provider.getBlock(tx.blockNumber)

    await expect(tx)
      .to.emit(controller, 'NameRegistered')
      .withArgs(
        'newconfigname',
        sha3('newconfigname'),
        registrantAccount,
        base.toString(),
        premium.toString(),
        block.timestamp + REGISTRATION_TIME,
      )

    expect((await fxs.balanceOf(controller.address)) - balanceBefore).to.equal(
      Number(price),
    )

    var nodehash = namehash('newconfigname.frax')
    expect(await ens.resolver(nodehash)).to.equal(resolver.address)
    expect(await ens.owner(nodehash)).to.equal(nameWrapper.address)
    expect(await baseRegistrar.ownerOf(sha3('newconfigname'))).to.equal(
      nameWrapper.address,
    )
    expect(await resolver['addr(bytes32)'](nodehash)).to.equal(
      registrantAccount,
    )
    expect(await resolver['text'](nodehash, 'url')).to.equal('frax.com')
    expect(await nameWrapper.ownerOf(nodehash)).to.equal(registrantAccount)
  })

  it('should not permit new registrations with 0 resolver', async () => {
    await expect(
      controller.makeCommitment(
        'newconfigname',
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        NULL_ADDRESS,
        callData,
        false,
        0,
      ),
    ).to.be.revertedWith('ResolverRequiredWhenDataSupplied()')
  })

  it('should not permit new registrations with EoA resolver', async () => {
    const commitment = await controller.makeCommitment(
      'newconfigname',
      registrantAccount,
      REGISTRATION_TIME,
      secret,
      registrantAccount,
      callData,
      false,
      0,
    )

    const tx = await controller.commit(commitment)
    expect(await controller.commitments(commitment)).to.equal(
      (await web3.eth.getBlock(tx.blockNumber)).timestamp,
    )

    await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
    await expect(
      controller.register(
        'newconfigname',
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        registrantAccount,
        callData,
        false,
        0,
      ),
    ).to.be.reverted
  })

  it('should not permit new registrations with an incompatible contract', async () => {
    const commitment = await controller.makeCommitment(
      'newconfigname',
      registrantAccount,
      REGISTRATION_TIME,
      secret,
      controller.address,
      callData,
      false,
      0,
    )

    const tx = await controller.commit(commitment)
    expect(await controller.commitments(commitment)).to.equal(
      (await web3.eth.getBlock(tx.blockNumber)).timestamp,
    )

    await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
    await expect(
      controller.register(
        'newconfigname',
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        controller.address,
        callData,
        false,
        0,
      ),
    ).to.be.revertedWith(
      "Transaction reverted: function selector was not recognized and there's no fallback function",
    )
  })

  it('should not permit new registrations with records updating a different name', async () => {
    const commitment = await controller2.makeCommitment(
      'awesome',
      registrantAccount,
      REGISTRATION_TIME,
      secret,
      resolver.address,
      [
        resolver.interface.encodeFunctionData('setAddr(bytes32,address)', [
          namehash('othername.frax'),
          registrantAccount,
        ]),
      ],
      false,
      0,
    )
    const tx = await controller2.commit(commitment)
    expect(await controller2.commitments(commitment)).to.equal(
      (await web3.eth.getBlock(tx.blockNumber)).timestamp,
    )

    await evm.advanceTime((await controller2.minCommitmentAge()).toNumber())

    await expect(
      controller2.register(
        'awesome',
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        resolver.address,
        [
          resolver.interface.encodeFunctionData('setAddr(bytes32,address)', [
            namehash('othername.frax'),
            registrantAccount,
          ]),
        ],
        false,
        0,
      ),
    ).to.be.revertedWith('multicall: All records must have a matching namehash')
  })

  it('should not permit new registrations with any record updating a different name', async () => {
    const commitment = await controller2.makeCommitment(
      'awesome',
      registrantAccount,
      REGISTRATION_TIME,
      secret,
      resolver.address,
      [
        resolver.interface.encodeFunctionData('setAddr(bytes32,address)', [
          namehash('awesome.frax'),
          registrantAccount,
        ]),
        resolver.interface.encodeFunctionData(
          'setText(bytes32,string,string)',
          [namehash('other.frax'), 'url', 'frax.com'],
        ),
      ],
      false,
      0,
    )
    const tx = await controller2.commit(commitment)
    expect(await controller2.commitments(commitment)).to.equal(
      (await web3.eth.getBlock(tx.blockNumber)).timestamp,
    )

    await evm.advanceTime((await controller2.minCommitmentAge()).toNumber())

    await expect(
      controller2.register(
        'awesome',
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        resolver.address,
        [
          resolver.interface.encodeFunctionData('setAddr(bytes32,address)', [
            namehash('awesome.frax'),
            registrantAccount,
          ]),
          resolver.interface.encodeFunctionData(
            'setText(bytes32,string,string)',
            [namehash('other.frax'), 'url', 'frax.com'],
          ),
        ],
        false,
        0,
      ),
    ).to.be.revertedWith('multicall: All records must have a matching namehash')
  })

  it('should permit a registration with resolver but no records', async () => {
    const commitment = await controller.makeCommitment(
      'newconfigname2',
      registrantAccount,
      REGISTRATION_TIME,
      secret,
      resolver.address,
      [],
      false,
      0,
    )

    let tx = await controller.commit(commitment)
    expect(await controller.commitments(commitment)).to.equal(
      (await web3.eth.getBlock(tx.blockNumber)).timestamp,
    )

    await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
    const balanceBefore = await fxs.balanceOf(controller.address)

    var { base, premium } = await controller.rentPrice(
      'newconfigname2',
      REGISTRATION_TIME,
    )
    var price = (Number(base) + Number(premium)).toString()
    await fxs.approve(controller.address, price)

    let tx2 = await controller.register(
      'newconfigname2',
      registrantAccount,
      REGISTRATION_TIME,
      secret,
      resolver.address,
      [],
      false,
      0,
    )

    const block = await provider.getBlock(tx2.blockNumber)

    await expect(tx2)
      .to.emit(controller, 'NameRegistered')
      .withArgs(
        'newconfigname2',
        sha3('newconfigname2'),
        registrantAccount,
        base.toString(),
        premium.toString(),
        block.timestamp + REGISTRATION_TIME,
      )

    const nodehash = namehash('newconfigname2.frax')
    expect(await ens.resolver(nodehash)).to.equal(resolver.address)
    expect(await resolver['addr(bytes32)'](nodehash)).to.equal(NULL_ADDRESS)
    expect((await fxs.balanceOf(controller.address)) - balanceBefore).to.equal(
      Number(price),
    )
  })

  it('should include the owner in the commitment', async () => {
    await controller.commit(
      await controller.makeCommitment(
        'newname2',
        accounts[2],
        REGISTRATION_TIME,
        secret,
        NULL_ADDRESS,
        [],
        false,
        0,
      ),
    )

    await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
    await expect(
      controller.register(
        'newname2',
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        NULL_ADDRESS,
        [],
        false,
        0,
        {
          value: BUFFERED_REGISTRATION_COST,
        },
      ),
    ).to.be.reverted
  })

  it('should reject duplicate registrations', async () => {
    const label = 'newname'
    await registerName(label)
    await controller.commit(
      await controller.makeCommitment(
        label,
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        NULL_ADDRESS,
        [],
        false,
        0,
      ),
    )

    await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
    await expect(
      controller.register(
        label,
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        NULL_ADDRESS,
        [],
        false,
        0,
      ),
    ).to.be.revertedWith(`NameNotAvailable("${label}")`)
  })

  it('should reject for expired commitments', async () => {
    const commitment = await controller.makeCommitment(
      'newname2',
      registrantAccount,
      REGISTRATION_TIME,
      secret,
      NULL_ADDRESS,
      [],
      false,
      0,
    )
    await controller.commit(commitment)

    await evm.advanceTime((await controller.maxCommitmentAge()).toNumber() + 1)
    await expect(
      controller.register(
        'newname2',
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        NULL_ADDRESS,
        [],
        false,
        0,
      ),
    ).to.be.revertedWith(`CommitmentTooOld("${commitment}")`)
  })

  it('should allow anyone to renew a name without changing fuse expiry', async () => {
    await registerName('newname')
    var nodehash = namehash('newname.frax')
    var fuseExpiry = (await nameWrapper.getData(nodehash))[2]
    var expires = await baseRegistrar.nameExpires(sha3('newname'))
    var balanceBefore = await fxs.balanceOf(controller.address)
    const duration = 86400
    var { base, premium } = await controller.rentPrice('newname', duration)
    await fxs.approve(controller.address, base)

    await controller.renew('newname', duration)
    var newExpires = await baseRegistrar.nameExpires(sha3('newname'))
    var newFuseExpiry = (await nameWrapper.getData(nodehash))[2]
    expect(newExpires.toNumber() - expires.toNumber()).to.equal(duration)
    expect(newFuseExpiry.toNumber() - fuseExpiry.toNumber()).to.equal(86400)

    expect((await fxs.balanceOf(controller.address)) - balanceBefore).to.equal(
      Number(base),
    )
  })

  it('should allow token owners to renew a name', async () => {
    const CANNOT_UNWRAP = 1
    const PARENT_CANNOT_CONTROL = 64

    await registerName('newname')
    var nodehash = namehash('newname.frax')
    const [, fuses, fuseExpiry] = await nameWrapper.getData(nodehash)

    var expires = await baseRegistrar.nameExpires(sha3('newname'))
    var balanceBefore = await fxs.balanceOf(controller.address)
    const duration = 86400
    var { base, premium } = await controller.rentPrice('newname', duration)
    await fxs2.approve(controller2.address, base)
    await controller2.renew('newname', duration)
    var newExpires = await baseRegistrar.nameExpires(sha3('newname'))
    const [, newFuses, newFuseExpiry] = await nameWrapper.getData(nodehash)
    expect(newExpires.toNumber() - expires.toNumber()).to.equal(duration)
    expect(newFuseExpiry.toNumber() - fuseExpiry.toNumber()).to.equal(duration)
    expect(newFuses).to.equal(fuses)
    expect((await fxs.balanceOf(controller.address)) - balanceBefore).to.equal(
      Number(base),
    )
  })

  it('non wrapped names can renew', async () => {
    const label = 'newname'
    const tokenId = sha3(label)
    const nodehash = namehash(`${label}.frax`)
    // this is to allow user to register without namewrapped
    await baseRegistrar.addController(ownerAccount)
    await baseRegistrar.register(tokenId, ownerAccount, 84600)

    expect(await nameWrapper.ownerOf(nodehash)).to.equal(ZERO_ADDRESS)
    expect(await baseRegistrar.ownerOf(tokenId)).to.equal(ownerAccount)

    var expires = await baseRegistrar.nameExpires(tokenId)
    const duration = 86400
    const [price] = await controller.rentPrice(tokenId, duration)
    var { base, premium } = await controller.rentPrice(tokenId, duration)
    await fxs.approve(controller.address, base)
    await controller.renew(label, duration)

    expect(await baseRegistrar.ownerOf(tokenId)).to.equal(ownerAccount)
    expect(await nameWrapper.ownerOf(nodehash)).to.equal(ZERO_ADDRESS)
    var newExpires = await baseRegistrar.nameExpires(tokenId)
    expect(newExpires.toNumber() - expires.toNumber()).to.equal(duration)
  })

  it('should allow anyone to withdraw funds and transfer to the registrar owner', async () => {
    await controller.withdraw({ from: ownerAccount })
    expect(parseInt(await fxs.balanceOf(controller.address))).to.equal(0)
  })

  it('should set the reverse record of the account', async () => {
    const commitment = await controller.makeCommitment(
      'reverse',
      registrantAccount,
      REGISTRATION_TIME,
      secret,
      resolver.address,
      [],
      true,
      0,
    )
    await controller.commit(commitment)

    await evm.advanceTime((await controller.minCommitmentAge()).toNumber())

    var { base, premium } = await controller.rentPrice(
      'reverse',
      REGISTRATION_TIME,
    )
    var price = (Number(base) + Number(premium)).toString()
    await fxs.approve(controller.address, price)

    await controller.register(
      'reverse',
      registrantAccount,
      REGISTRATION_TIME,
      secret,
      resolver.address,
      [],
      true,
      0,
    )

    expect(await resolver.name(getReverseNode(ownerAccount))).to.equal(
      'reverse.frax',
    )
  })

  it('should not set the reverse record of the account when set to false', async () => {
    const commitment = await controller.makeCommitment(
      'noreverse',
      registrantAccount,
      REGISTRATION_TIME,
      secret,
      resolver.address,
      [],
      false,
      0,
    )
    await controller.commit(commitment)

    await evm.advanceTime((await controller.minCommitmentAge()).toNumber())

    var { base, premium } = await controller.rentPrice(
      'noreverse',
      REGISTRATION_TIME,
    )
    var price = (Number(base) + Number(premium)).toString()
    await fxs.approve(controller.address, price)

    await controller.register(
      'noreverse',
      registrantAccount,
      REGISTRATION_TIME,
      secret,
      resolver.address,
      [],
      false,
      0,
    )

    expect(await resolver.name(getReverseNode(ownerAccount))).to.equal('')
  })

  it('should auto wrap the name and set the ERC721 owner to the wrapper', async () => {
    const label = 'wrapper'
    const name = label + '.frax'
    const commitment = await controller.makeCommitment(
      label,
      registrantAccount,
      REGISTRATION_TIME,
      secret,
      resolver.address,
      [],
      true,
      0,
    )
    await controller.commit(commitment)

    await evm.advanceTime((await controller.minCommitmentAge()).toNumber())

    var { base, premium } = await controller.rentPrice(label, REGISTRATION_TIME)
    var price = (Number(base) + Number(premium)).toString()
    await fxs.approve(controller.address, price)

    await controller.register(
      label,
      registrantAccount,
      REGISTRATION_TIME,
      secret,
      resolver.address,
      [],
      true,
      0,
    )

    expect(await nameWrapper.ownerOf(namehash(name))).to.equal(
      registrantAccount,
    )

    expect(await ens.owner(namehash(name))).to.equal(nameWrapper.address)
    expect(await baseRegistrar.ownerOf(sha3(label))).to.equal(
      nameWrapper.address,
    )
  })

  it('should auto wrap the name and allow fuses and expiry to be set', async () => {
    const MAX_INT_64 = 2n ** 64n - 1n
    const label = 'fuses'
    const name = label + '.frax'
    const commitment = await controller.makeCommitment(
      label,
      registrantAccount,
      REGISTRATION_TIME,
      secret,
      resolver.address,
      [],
      true,
      1,
    )
    await controller.commit(commitment)

    await evm.advanceTime((await controller.minCommitmentAge()).toNumber())

    var { base, premium } = await controller.rentPrice(label, REGISTRATION_TIME)
    var price = (Number(base) + Number(premium)).toString()
    await fxs.approve(controller.address, price)

    const tx = await controller.register(
      label,
      registrantAccount,
      REGISTRATION_TIME,
      secret,
      resolver.address,
      [],
      true,
      1,
    )

    const block = await provider.getBlock(tx.block)

    const [, fuses, expiry] = await nameWrapper.getData(namehash(name))
    expect(fuses).to.equal(PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | IS_DOT_ETH)
    expect(expiry).to.equal(REGISTRATION_TIME + GRACE_PERIOD + block.timestamp)
  })

  it('should not permit new registrations with non resolver function calls', async () => {
    const label = 'newconfigname'
    const name = `${label}.frax`
    const node = namehash(name)
    const secondTokenDuration = 788400000 // keep bogus NFT for 25 years;
    const callData = [
      baseRegistrar.interface.encodeFunctionData(
        'register(uint256,address,uint)',
        [node, registrantAccount, secondTokenDuration],
      ),
    ]
    var commitment = await controller.makeCommitment(
      label,
      registrantAccount,
      REGISTRATION_TIME,
      secret,
      baseRegistrar.address,
      callData,
      false,
      0,
    )
    var tx = await controller.commit(commitment)
    expect(await controller.commitments(commitment)).to.equal(
      (await web3.eth.getBlock(tx.blockNumber)).timestamp,
    )
    await evm.advanceTime((await controller.minCommitmentAge()).toNumber())
    await expect(
      controller.register(
        label,
        registrantAccount,
        REGISTRATION_TIME,
        secret,
        baseRegistrar.address,
        callData,
        false,
        0,
      ),
    ).to.be.revertedWith(
      "Transaction reverted: function selector was not recognized and there's no fallback function",
    )
  })
})

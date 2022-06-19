import { ethers, waffle } from 'hardhat'
import { BigNumber, Signer } from 'ethers'
import chai, { expect } from 'chai'
import { IDriss } from '../src/types/IDriss'
import IDrissArtifact from '../src/artifacts/src/contracts/mocks/IDrissRegistryMock.sol/IDriss.json'
import { MaticPriceAggregatorV3Mock } from '../src/types/MaticPriceAggregatorV3Mock'
import MaticPriceAggregatorV3MockArtifact from '../src/artifacts/src/contracts/mocks/MaticPriceAggregatorV3Mock.sol/MaticPriceAggregatorV3Mock.json'
import { MockNFT } from '../src/types/MockNFT'
import MockNFTArtifact from '../src/artifacts/src/contracts/mocks/IDrissRegistryMock.sol/MockNFT.json'
import MockTokenArtifact from '../src/artifacts/src/contracts/mocks/IDrissRegistryMock.sol/MockToken.json'
import { MockToken } from '../src/types/MockToken'
import { SendToHash } from '../src/types/SendToHash'
import SendToHashArtifact from '../src/artifacts/src/contracts/SendToHash.sol/SendToHash.json'
import chaiAsPromised from 'chai-as-promised'
import { MockProvider, solidity } from 'ethereum-waffle'

chai.use(solidity) // solidiity matchers, e.g. expect().to.be.revertedWith("message")
chai.use(chaiAsPromised) //eventually

const ASSET_TYPE_COIN = 0
const ASSET_TYPE_TOKEN = 1
const ASSET_TYPE_NFT = 2
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

const negateBigNumber = (num: BigNumber): BigNumber => {
      return BigNumber.from(`-${num.toString()}`)
}

describe('SendToHash contract', () => {
   let owner: Signer;
   let signer1: Signer;
   let signer2: Signer;
   let signer3: Signer;
   let ownerAddress: string;
   let signer1Address: string;
   let signer2Address: string;
   let signer3Address: string;
   let sendToHash: SendToHash
   let idriss: IDriss
   let mockToken: MockToken
   let mockNFT: MockNFT
   let mockPriceOracle: MaticPriceAggregatorV3Mock
   let NFT_ID_ARRAY = [... Array(10).keys()]
   let provider: MockProvider

   beforeEach(async () => {
      provider = new MockProvider({ ganacheOptions: { gasLimit: 100000000 } })
      owner = provider.getSigner(0)
      signer1 = provider.getSigner(1)
      signer2 = provider.getSigner(2)
      signer3 = provider.getSigner(3)
      ownerAddress = await owner.getAddress()
      signer1Address = await signer1.getAddress()
      signer2Address = await signer2.getAddress()
      signer3Address = await signer3.getAddress()

      mockToken = (await waffle.deployContract(owner, MockTokenArtifact, [])) as MockToken
      mockNFT = (await waffle.deployContract(owner, MockNFTArtifact, [])) as MockNFT
      mockPriceOracle = (await waffle.deployContract(owner, MaticPriceAggregatorV3MockArtifact, [])) as MaticPriceAggregatorV3Mock
      idriss = (await waffle.deployContract(owner, IDrissArtifact, [signer2Address])) as IDriss
      sendToHash = (await waffle.deployContract(owner, SendToHashArtifact,
         [idriss.address, mockPriceOracle.address])) as SendToHash

      Promise.all(
         NFT_ID_ARRAY.map( async (val, idx, _) => { 
            return mockNFT.safeMint(ownerAddress, val)
         })
      )
   })

   it('reverts sendToAnyone() when MATIC value is zero', async () => {
      await expect(sendToHash.sendToAnyone('a', 0, ASSET_TYPE_COIN, ZERO_ADDRESS, 0)).to.be.revertedWith('Value sent is smaller than minimal fee.')
      await expect(sendToHash.sendToAnyone('a', 0, ASSET_TYPE_TOKEN, ZERO_ADDRESS, 0)).to.be.revertedWith('Value sent is smaller than minimal fee.')
      await expect(sendToHash.sendToAnyone('a', 0, ASSET_TYPE_NFT, ZERO_ADDRESS, 0)).to.be.revertedWith('Value sent is smaller than minimal fee.')
   })

   it ('reverts sendToAnyone() when an incorrect asset type is passed', async () => {
      await expect(sendToHash.sendToAnyone('a', 0, 5, ZERO_ADDRESS, 0)).to.be.reverted
   })

   it ('reverts sendToAnyone() when asset address is 0', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()

      await expect(sendToHash.sendToAnyone('a', 1, ASSET_TYPE_TOKEN, ZERO_ADDRESS, 0, {value: dollarInWei}))
         .to.be.revertedWith('Asset address cannot be 0')
      await expect(sendToHash.sendToAnyone('a', 1, ASSET_TYPE_NFT, ZERO_ADDRESS, 0, {value: dollarInWei}))
         .to.be.revertedWith('Asset address cannot be 0')
   })

   it ('reverts sendToAnyone() when asset amount is 0', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()

      await expect(sendToHash.sendToAnyone('a', 0, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei}))
         .to.be.revertedWith('Asset amount has to be bigger than 0')
      await expect(sendToHash.sendToAnyone('a', 0, ASSET_TYPE_NFT, mockNFT.address, 0, {value: dollarInWei}))
         .to.be.revertedWith('Asset amount has to be bigger than 0')
   })

   it ('reverts sendToAnyone() when receiver does not have allowance for a token', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()

      await mockToken.transfer(signer1Address, 5)
      expect(await mockToken.balanceOf(signer1Address)).to.be.equal(5)

      await mockToken.connect(signer1).approve(sendToHash.address, 5)
      expect(await mockToken.allowance(signer1Address, sendToHash.address)).to.be.equal(5)

      await expect(sendToHash.connect(signer1).sendToAnyone('b', 10, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei}))
         .to.be.revertedWith('ERC20: insufficient allowance')
   })

   it ('reverts sendToAnyone() when sender is not allowed to send an NFT', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()

      await expect(sendToHash.connect(signer1).sendToAnyone('a', 1, ASSET_TYPE_NFT, mockNFT.address, 1, {value: dollarInWei}))
         .to.be.revertedWith('Receiver is not approved to receive the NFT')
   })

   it ('properly handles asset address for MATIC transfer', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()
      const payments = [dollarInWei.add(100), dollarInWei.add(2500), dollarInWei.add(968)]

      expect(await sendToHash.sendToAnyone('a', 0, ASSET_TYPE_COIN, mockToken.address, 0, {value: payments[0]}))
         .to.changeEtherBalances([owner, sendToHash], [negateBigNumber(payments[0]), payments[0]])

      expect(await sendToHash.balanceOf('a', ASSET_TYPE_COIN, ZERO_ADDRESS)).to.be.equal(100)

      expect(await sendToHash.sendToAnyone('a', 0, ASSET_TYPE_COIN, mockNFT.address, 0, {value: payments[1]}))
         .to.changeEtherBalances([owner, sendToHash], [negateBigNumber(payments[1]), payments[1]])

      expect(await sendToHash.balanceOf('a', ASSET_TYPE_COIN, mockToken.address)).to.be.equal(100 + 2500)

      expect(await sendToHash.sendToAnyone('a', 0, ASSET_TYPE_COIN, ZERO_ADDRESS, 0, {value: payments[2]}))
         .to.changeEtherBalances([owner, sendToHash], [negateBigNumber(payments[2]), payments[2]])

      expect(await sendToHash.balanceOf('a', ASSET_TYPE_COIN, mockNFT.address)).to.be.equal(100 + 2500 + 968)
   })

   //TODO: check
   // it ('properly handles oracle price changes', async () => {
   //    const decimals = await mockPriceOracle.decimals()
   //    const maticPriceMultiplier = BigNumber.from(10^18).mul(BigNumber.from(10^decimals))
   //    let answer: BigNumber;
      
   //    ({ answer } = await mockPriceOracle.latestRoundData())
   //    let dollarInWei = await mockPriceOracle.dollarToWei()
   //    let calculatedDollarInWei = maticPriceMultiplier.div(answer)

   //    expect(calculatedDollarInWei.toString()).to.be.equal(dollarInWei.toString())

   //    await mockPriceOracle.setPrice(answer.mul(2));

   //    ({ answer } = await mockPriceOracle.latestRoundData())
   //    dollarInWei = await mockPriceOracle.dollarToWei()
   //    calculatedDollarInWei = maticPriceMultiplier.div(answer)

   //    expect(calculatedDollarInWei.toString()).to.be.equal(dollarInWei.toString())
      
   // })

   it ('reverts when fee is below 95 cents', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()
      const minimalFee = dollarInWei.mul(93).div(100)

      await mockToken.approve(sendToHash.address, 5)

      await expect(sendToHash.sendToAnyone('a', 5, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: minimalFee}))
         .to.be.revertedWith('Value sent is smaller than minimal fee.')
   })

   it ('properly handles fee on 96 cents', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()
      const minimalFee = dollarInWei.mul(96).div(100)

      await mockToken.approve(sendToHash.address, 5)

      expect(await sendToHash.sendToAnyone('a', 5, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: minimalFee}))
         .to.changeEtherBalances([owner, sendToHash], [negateBigNumber(minimalFee), minimalFee])
   })

   it ('properly handles fee on a 1$ transfer', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()

      await mockToken.approve(sendToHash.address, 5)

      expect(await sendToHash.sendToAnyone('a', 5, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei}))
         .to.changeEtherBalances([owner, sendToHash], [negateBigNumber(dollarInWei), dollarInWei])
   })

   it ('properly handles 1% fee for cash transfer', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()
      const valueToTransfer = dollarInWei.mul(250)
      const expectedFee = valueToTransfer.div(100)

      expect(await sendToHash.sendToAnyone('a', 0, ASSET_TYPE_COIN, ZERO_ADDRESS, 0, {value: valueToTransfer}))
         .to.changeEtherBalances([owner, sendToHash], [negateBigNumber(valueToTransfer), valueToTransfer])

      const accountBalance = (await sendToHash.balanceOf('a', ASSET_TYPE_COIN, ZERO_ADDRESS)).toString()

      expect(accountBalance).to.be.equal(valueToTransfer.sub(expectedFee).toString())
   })

   it ('properly handles amounts in sendToAnyone() for MATIC transfer', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()
      const minimumAcceptablePayment = dollarInWei.add(1)
      const minimumAcceptablePaymentNegated = negateBigNumber(minimumAcceptablePayment)

      await expect(sendToHash.sendToAnyone('a', 0, ASSET_TYPE_COIN, ZERO_ADDRESS, 0, {value: dollarInWei}))
         .to.be.revertedWith('Transferred value has to be bigger than 0')

      await expect(await sendToHash.sendToAnyone('a', 0, ASSET_TYPE_COIN, ZERO_ADDRESS, 0, {value: minimumAcceptablePayment}))
         .to.changeEtherBalances([owner, sendToHash], [minimumAcceptablePaymentNegated, minimumAcceptablePayment])

      expect(await sendToHash.balanceOf('a', ASSET_TYPE_COIN, ZERO_ADDRESS)).to.be.equal(1)
   })

   it ('properly handles amounts in sendToAnyone() for single Token transfer', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()

      await mockToken.approve(sendToHash.address, 500)
      await mockToken.transfer(signer1Address, 500)
      await mockToken.connect(signer1).approve(sendToHash.address, 300)

      await expect(() => sendToHash.sendToAnyone('a', 100, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei}))
         .to.changeTokenBalances(mockToken, [owner, sendToHash], [-100, 100])

      expect(await sendToHash.balanceOf('a', ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(100)

      await expect(() => sendToHash.sendToAnyone('bcd', 300, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei}))
         .to.changeTokenBalances(mockToken, [owner, sendToHash], [-300, 300])

      expect(await sendToHash.balanceOf('a', ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(100)
      expect(await sendToHash.balanceOf('bcd', ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(300)
   })

   it ('properly handles amounts in sendToAnyone() for single NFT transfer', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()

      await mockNFT.approve(sendToHash.address, 0)
      await mockNFT.transferFrom(ownerAddress, signer1Address, 1)
      await mockNFT.connect(signer1).approve(sendToHash.address, 1)
      await mockNFT.approve(sendToHash.address, 2)
      await mockNFT.transferFrom(ownerAddress, signer1Address, 3)
      await mockNFT.connect(signer1).approve(sendToHash.address, 3)
      await mockNFT.transferFrom(ownerAddress, signer1Address, 4)
      await mockNFT.connect(signer1).approve(sendToHash.address, 4)

      await expect(() => sendToHash.sendToAnyone('a', 1, ASSET_TYPE_NFT, mockNFT.address, 0, {value: dollarInWei}))
         .to.changeTokenBalances(mockNFT, [owner, sendToHash], [-1, 1])

      await expect(() => sendToHash.connect(signer1).sendToAnyone('a', 1, ASSET_TYPE_NFT, mockNFT.address, 1, {value: dollarInWei}))
         .to.changeTokenBalances(mockNFT, [signer1, sendToHash], [-1, 1])

      expect(await sendToHash.balanceOf('a', ASSET_TYPE_NFT, mockNFT.address)).to.be.equal(2)

      await expect(() => sendToHash.sendToAnyone('bcd', 1, ASSET_TYPE_NFT, mockNFT.address, 2, {value: dollarInWei}))
         .to.changeTokenBalances(mockNFT, [owner, sendToHash], [-1, 1])

      await expect(() => sendToHash.connect(signer1).sendToAnyone('bcd', 1, ASSET_TYPE_NFT, mockNFT.address, 3, {value: dollarInWei}))
         .to.changeTokenBalances(mockNFT, [signer1, sendToHash], [-1, 1])
      await expect(() => sendToHash.connect(signer1).sendToAnyone('bcd', 1, ASSET_TYPE_NFT, mockNFT.address, 4, {value: dollarInWei}))
         .to.changeTokenBalances(mockNFT, [signer1, sendToHash], [-1, 1])

      expect(await sendToHash.balanceOf('a', ASSET_TYPE_NFT, mockNFT.address)).to.be.equal(2)
      expect(await sendToHash.balanceOf('bcd', ASSET_TYPE_NFT, mockNFT.address)).to.be.equal(3)
   })

   it ('properly handles amounts in sendToAnyone() for multiple Token transfer of the same type', async () => {
      const dollarInWei = await mockPriceOracle.dollarToWei()

      await mockToken.approve(sendToHash.address, 500)
      await mockToken.transfer(signer1Address, 500)
      await mockToken.connect(signer1).approve(sendToHash.address, 300)

      await expect(() => sendToHash.sendToAnyone('a', 100, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei}))
         .to.changeTokenBalances(mockToken, [owner, sendToHash], [-100, 100])

      await expect(() => sendToHash.connect(signer1).sendToAnyone('a', 250, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei}))
         .to.changeTokenBalances(mockToken, [signer1, sendToHash], [-250, 250])

      expect(await sendToHash.balanceOf('a', ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(350)

      await expect(() => sendToHash.sendToAnyone('bcd', 300, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei}))
         .to.changeTokenBalances(mockToken, [owner, sendToHash], [-300, 300])

      await expect(() => sendToHash.connect(signer1).sendToAnyone('bcd', 20, ASSET_TYPE_TOKEN, mockToken.address, 0, {value: dollarInWei}))
         .to.changeTokenBalances(mockToken, [signer1, sendToHash], [-20, 20])

      expect(await sendToHash.balanceOf('a', ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(350)
      expect(await sendToHash.balanceOf('bcd', ASSET_TYPE_TOKEN, mockToken.address)).to.be.equal(320)
   })

   // it ('properly handles assets for multiple asset transfers', async () => {
   //    const dollarInWei = await mockPriceOracle.dollarToWei()
   //    //TODO: implement
   //    expect(0).to.be.equal(1)
   // })

   // it ('properly handles assets for multiple asset transfers and reversals', async () => {
   //    const dollarInWei = await mockPriceOracle.dollarToWei()
   //    //TODO: implement
   //    expect(0).to.be.equal(1)
   // })

   // it ('properly handles amounts in sendToAnyone() for multiple Token transfer of many types', async () => {
   //    const dollarInWei = await mockPriceOracle.dollarToWei()
   //    //TODO: implement
   //    expect(0).to.be.equal(1)
   // })

   // it ('properly handles amounts in sendToAnyone() for multiple NFT transfer of the same type', async () => {
   //    const dollarInWei = await mockPriceOracle.dollarToWei()
   //    //TODO: implement
   //    expect(0).to.be.equal(1)
   // })

   // it ('properly handles amounts in sendToAnyone() for multiple NFT transfer of many types', async () => {
   //    const dollarInWei = await mockPriceOracle.dollarToWei()
   //    //TODO: implement
   //    expect(0).to.be.equal(1)
   // })

   // it ('prevents reentrancy attacks', async () => {
   //    const dollarInWei = await mockPriceOracle.dollarToWei()
   //    //TODO: implement
   //    expect(0).to.be.equal(1)
   // })

   // it ('allows transfering all fees earned by the contract to the owner', async () => {
   //    const dollarInWei = await mockPriceOracle.dollarToWei()
   //    //TODO: implement
   //    expect(0).to.be.equal(1)
   // })

   // it ('reverts revertPayment() when there is nothing to revert', async () => {
   //    const dollarInWei = await mockPriceOracle.dollarToWei()
   //    //TODO: implement
   //    expect(0).to.be.equal(1)
   // })

   // it ('reverts revertPayment() when trying go revert payment second time', async () => {
   //    const dollarInWei = await mockPriceOracle.dollarToWei()
   //    //TODO: implement
   //    expect(0).to.be.equal(1)
   // })

   // it ('properly handles successful revertPayment()', async () => {
   //    const dollarInWei = await mockPriceOracle.dollarToWei()
   //    //TODO: implement
   //    expect(0).to.be.equal(1)
   // })

   // it ('reverts claim() when there is nothing to claim', async () => {
   //    const dollarInWei = await mockPriceOracle.dollarToWei()
   //    //TODO: implement
   //    expect(0).to.be.equal(1)
   // })

   // it ('reverts claim() when IDriss hash does not resolve to proper address', async () => {
   //    const dollarInWei = await mockPriceOracle.dollarToWei()
   //    //TODO: implement
   //    expect(0).to.be.equal(1)
   // })

   // it ('properly handles successful claim()', async () => {
   //    const dollarInWei = await mockPriceOracle.dollarToWei()
   //    //TODO: implement
   //    expect(0).to.be.equal(1)
   // })

   // it ('reverts claim() when trying go claim payment for second time', async () => {
   //    const dollarInWei = await mockPriceOracle.dollarToWei()
   //    //TODO: implement
   //    expect(0).to.be.equal(1)
   // })

   // it ('emits events on successful function invocations', async () => {
   //    const dollarInWei = await mockPriceOracle.dollarToWei()
   //    //TODO: implement
   //    expect(0).to.be.equal(1)
   // })
})


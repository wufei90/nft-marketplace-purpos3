const { expect } = require("chai");
const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-network-helpers");
const tokenURI = "https://ipfs.io/ipfs/";
const itemPrice = 0.1;
const price = ethers.utils.parseEther(itemPrice.toString());
const duration = 86400 * 2;
const minDuration = 86400;
const minStep = minDuration + 301;

describe("Marketplace contract", function () {
  async function deployFixture() {
    const [owner, foundation, addr1, addr2] = await ethers.getSigners();

    const NFTMarket = await ethers.getContractFactory("NFTMarket");
    const market = await NFTMarket.deploy();
    await market.deployed();

    const NFT = await ethers.getContractFactory("NFT");
    const nft1 = await NFT.deploy("Name1", "NFT1");
    await nft1.deployed();
    await nft1.connect(owner).transferOwnership(foundation.address);

    await nft1.connect(addr1).setApprovalForAll(market.address, true);
    await nft1.connect(addr2).setApprovalForAll(market.address, true);

    const nft2 = await NFT.deploy("Name2", "NFT2");
    await nft2.deployed();
    await nft2.connect(owner).transferOwnership(foundation.address);

    return { NFTMarket, market, nft1, nft2, owner, foundation, addr1, addr2 };
  }

  async function viewerFixture() {
    const { market, nft1, addr1, addr2 } = await loadFixture(deployFixture);

    await market
      .connect(addr1)
      .mintAndList(nft1.address, tokenURI, price, duration);
    await market
      .connect(addr1)
      .mintAndList(nft1.address, tokenURI, price, duration);
    await market
      .connect(addr2)
      .mintAndList(nft1.address, tokenURI, price, minDuration);
    await market
      .connect(addr2)
      .mintAndList(nft1.address, tokenURI, price, minDuration);

    /*
     *item 1 : listed
     *item 2 : sold to addr2
     *item 3 : delisted
     *item 4 : waiting to be delisted
     */
    await time.increase(minStep);

    await market.connect(addr2).buyItem(2, { value: price });
    await market.connect(addr2).delistItem(3);
    return { market, nft1, addr1, addr2 };
  }

  async function mintNFT(contract, account) {
    const tx = await contract.connect(account).createToken(tokenURI);
    const receipt = await tx.wait();
    for (const event of receipt.events) {
      if (event.event == "Transfer") {
        return event.args[2];
      }
    }
    return null;
  }

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      const { market, owner } = await loadFixture(deployFixture);
      expect(await market.owner()).to.equal(owner.address);
    });

    it("Should mint NFT", async function () {
      const { nft1, nft2, addr1 } = await loadFixture(deployFixture);
      const tokenId1 = await mintNFT(nft1, addr1);
      expect(await nft1.ownerOf(tokenId1)).to.equal(addr1.address);
      expect(await nft1.name()).to.equal("Name1");
      expect(await nft1.symbol()).to.equal("NFT1");
      const tokenId2 = await mintNFT(nft2, addr1);
      expect(await nft2.ownerOf(tokenId2)).to.equal(addr1.address);
      expect(await nft2.name()).to.equal("Name2");
      expect(await nft2.symbol()).to.equal("NFT2");
    });
  });

  describe("Operation", async function () {
    it("Should update fee rate", async function () {
      const { market, owner } = await loadFixture(deployFixture);
      const newRate = 5;
      await market.connect(owner).updateFeeRate(newRate);
      expect(await market.feeRate()).to.equal(newRate);
    });

    it("Should fail to update fee rate", async function () {
      const { market, owner } = await loadFixture(deployFixture);
      const newRate = 15;
      await expect(
        market.connect(owner).updateFeeRate(newRate)
      ).to.revertedWith("Fee rate should be lower than 10");
    });

    it("Should fail to update fee rate", async function () {
      const { market, owner, addr1 } = await loadFixture(deployFixture);
      const newRate = 5;
      await expect(
        market.connect(addr1).updateFeeRate(newRate)
      ).to.revertedWith("Ownable: caller is not the owner");
    });
  });
  describe("Listing", function () {
    it("Should list an item", async function () {
      const { market, nft1, foundation, addr1 } = await loadFixture(
        deployFixture
      );
      const tokenId = await mintNFT(nft1, addr1);
      await expect(
        market
          .connect(addr1)
          .listItemForSale(nft1.address, tokenId, price, duration)
      )
        .to.emit(market, "ItemListed")
        .withArgs(
          1,
          nft1.address,
          tokenId,
          addr1.address,
          foundation.address,
          price
        );
      expect(await nft1.ownerOf(tokenId)).to.equal(market.address);
    });

    it("Should fail to list item if item not approved", async function () {
      const { market, nft2, foundation, addr1 } = await loadFixture(
        deployFixture
      );
      const tokenId = await mintNFT(nft2, addr1);
      await expect(
        market
          .connect(addr1)
          .listItemForSale(nft2.address, tokenId, price, duration)
      ).to.revertedWith("ERC721: caller is not token owner nor approved");
      expect(await nft2.ownerOf(tokenId)).to.equal(addr1.address);
    });

    it("Should fail to list item if duration is too short", async function () {
      const { market, nft1, foundation, addr1 } = await loadFixture(
        deployFixture
      );
      const tokenId = await mintNFT(nft1, addr1);
      await expect(
        market.connect(addr1).listItemForSale(nft1.address, tokenId, price, 1)
      ).to.revertedWith("Listing should last more than 1 day");
      expect(await nft1.ownerOf(tokenId)).to.equal(addr1.address);
    });

    it("Should mint and list an item", async function () {
      const { market, nft1, foundation, addr1 } = await loadFixture(
        deployFixture
      );
      await nft1.connect(addr1).setApprovalForAll(market.address, true);
      await expect(
        market
          .connect(addr1)
          .mintAndList(nft1.address, tokenURI, price, duration)
      )
        .to.emit(market, "ItemListed")
        .withArgs(1, nft1.address, 1, addr1.address, foundation.address, price);
      expect(await nft1.ownerOf(1)).to.equal(market.address);
    });

    it("Should fail to mint and list item if duration is too short", async function () {
      const { market, nft1, foundation, addr1 } = await loadFixture(
        deployFixture
      );
      await expect(
        market.connect(addr1).mintAndList(nft1.address, tokenURI, price, 1)
      ).to.revertedWith("Listing should last more than 1 day");
      await expect(nft1.ownerOf(1)).to.revertedWith("ERC721: invalid token ID");
    });

    it("Should execute transaction", async function () {
      const { market, nft1, owner, foundation, addr1, addr2 } =
        await loadFixture(deployFixture);
      const itemId = 1;
      const tokenId = 1;
      const feeRate = await market.feeRate();
      const fees = price.mul(feeRate).div(100);

      await expect(
        market
          .connect(addr1)
          .mintAndList(nft1.address, tokenURI, price, duration)
      )
        .to.emit(market, "ItemListed")
        .withArgs(
          itemId,
          nft1.address,
          tokenId,
          addr1.address,
          foundation.address,
          price
        );

      let expectedBalance1 = await ethers.provider.getBalance(
        foundation.address
      );
      expectedBalance1 = expectedBalance1.add(price).sub(fees);

      let expectedBalance2 = await ethers.provider.getBalance(owner.address);
      expectedBalance2 = expectedBalance2.add(fees);

      await expect(market.connect(addr2).buyItem(itemId, { value: price }))
        .to.emit(market, "ItemSold")
        .withArgs(
          itemId,
          nft1.address,
          tokenId,
          addr1.address,
          addr2.address,
          foundation.address,
          price
        );
      expect(await ethers.provider.getBalance(foundation.address)).to.be.equal(
        expectedBalance1
      );
      expect(await ethers.provider.getBalance(owner.address)).to.be.equal(
        expectedBalance2
      );
      expect(await nft1.ownerOf(tokenId)).to.equal(addr2.address);
    });

    it("Should execute transaction", async function () {
      const { market, nft1, owner, foundation, addr1, addr2 } =
        await loadFixture(deployFixture);
      const itemId = 1;
      const tokenId = await mintNFT(nft1, addr1);
      const feeRate = await market.feeRate();
      const fees = price.mul(feeRate).div(100);

      await expect(
        market
          .connect(addr1)
          .listItemForSale(nft1.address, tokenId, price, duration)
      )
        .to.emit(market, "ItemListed")
        .withArgs(
          itemId,
          nft1.address,
          tokenId,
          addr1.address,
          foundation.address,
          price
        );

      let expectedBalance1 = await ethers.provider.getBalance(
        foundation.address
      );
      expectedBalance1 = expectedBalance1.add(price).sub(fees);

      let expectedBalance2 = await ethers.provider.getBalance(owner.address);
      expectedBalance2 = expectedBalance2.add(fees);

      await expect(market.connect(addr2).buyItem(itemId, { value: price }))
        .to.emit(market, "ItemSold")
        .withArgs(
          itemId,
          nft1.address,
          tokenId,
          addr1.address,
          addr2.address,
          foundation.address,
          price
        );
      expect(await ethers.provider.getBalance(foundation.address)).to.be.equal(
        expectedBalance1
      );
      expect(await ethers.provider.getBalance(owner.address)).to.be.equal(
        expectedBalance2
      );
      expect(await nft1.ownerOf(tokenId)).to.equal(addr2.address);
    });

    it("Should fail to do the transaction if auction has expired", async function () {
      const { market, nft1, foundation, addr1, addr2 } = await loadFixture(
        deployFixture
      );
      const tokenId = 1;
      const itemId = 1;

      await expect(
        market
          .connect(addr1)
          .mintAndList(nft1.address, tokenURI, price, duration)
      )
        .to.emit(market, "ItemListed")
        .withArgs(
          itemId,
          nft1.address,
          tokenId,
          addr1.address,
          foundation.address,
          price
        );

      await time.increase(duration * 2);

      await expect(
        market.connect(addr2).buyItem(itemId, { value: price })
      ).to.revertedWith("Item not available for sale");
    });

    it("Should fail to do the transaction if item has been sold", async function () {
      const { market, nft1, foundation, addr1, addr2 } = await loadFixture(
        deployFixture
      );
      const tokenId = 1;
      const itemId = 1;

      await expect(
        market
          .connect(addr1)
          .mintAndList(nft1.address, tokenURI, price, duration)
      )
        .to.emit(market, "ItemListed")
        .withArgs(
          itemId,
          nft1.address,
          tokenId,
          addr1.address,
          foundation.address,
          price
        );

      await expect(market.connect(addr2).buyItem(itemId, { value: price }))
        .to.emit(market, "ItemSold")
        .withArgs(
          itemId,
          nft1.address,
          tokenId,
          addr1.address,
          addr2.address,
          foundation.address,
          price
        );

      await expect(
        market.connect(addr2).buyItem(itemId, { value: price })
      ).to.revertedWith("Item already sold");
    });

    it("Should fail to do the transaction if not enough fund", async function () {
      const { market, nft1, foundation, addr1, addr2 } = await loadFixture(
        deployFixture
      );
      const tokenId = 1;
      const itemId = 1;

      await expect(
        market
          .connect(addr1)
          .mintAndList(nft1.address, tokenURI, price, duration)
      )
        .to.emit(market, "ItemListed")
        .withArgs(
          itemId,
          nft1.address,
          tokenId,
          addr1.address,
          foundation.address,
          price
        );

      await expect(
        market.connect(addr2).buyItem(itemId, { value: price.sub(1) })
      ).to.revertedWith(
        "Please submit the asking price in order to complete the purchase"
      );
    });

    it("Should fail to do the transaction if item has been delisted", async function () {
      const { market, nft1, foundation, addr1, addr2 } = await loadFixture(
        deployFixture
      );
      const tokenId = 1;
      const itemId = 1;

      await expect(
        market
          .connect(addr1)
          .mintAndList(nft1.address, tokenURI, price, duration)
      )
        .to.emit(market, "ItemListed")
        .withArgs(
          itemId,
          nft1.address,
          tokenId,
          addr1.address,
          foundation.address,
          price
        );

      await time.increase(duration * 2);

      await expect(market.connect(addr1).delistItem(itemId))
        .to.emit(market, "ItemDelisted")
        .withArgs(itemId, nft1.address, tokenId, addr1.address, price);

      await expect(
        market.connect(addr2).buyItem(itemId, { value: price })
      ).to.revertedWith("Item already sold");
    });

    it("Should fail to do the transaction if item does not exist", async function () {
      const { market, addr1 } = await loadFixture(deployFixture);
      const itemId = 10;

      await expect(
        market.connect(addr1).buyItem(itemId, { value: 0 })
      ).to.revertedWith("Item does not exist");
    });

    it("Should delist item", async function () {
      const { market, nft1, foundation, addr1, addr2 } = await loadFixture(
        deployFixture
      );
      const tokenId = 1;
      const itemId = 1;

      await expect(
        market
          .connect(addr1)
          .mintAndList(nft1.address, tokenURI, price, duration)
      )
        .to.emit(market, "ItemListed")
        .withArgs(
          itemId,
          nft1.address,
          tokenId,
          addr1.address,
          foundation.address,
          price
        );

      await time.increase(duration * 2);

      await expect(market.connect(addr1).delistItem(itemId))
        .to.emit(market, "ItemDelisted")
        .withArgs(itemId, nft1.address, tokenId, addr1.address, price);

      expect(await nft1.ownerOf(tokenId)).to.equal(addr1.address);
    });

    it("Should delist item", async function () {
      const { market, nft1, foundation, addr1, addr2 } = await loadFixture(
        deployFixture
      );
      const tokenId = await mintNFT(nft1, addr1);
      const itemId = 1;

      await expect(
        market
          .connect(addr1)
          .listItemForSale(nft1.address, tokenId, price, duration)
      )
        .to.emit(market, "ItemListed")
        .withArgs(
          itemId,
          nft1.address,
          tokenId,
          addr1.address,
          foundation.address,
          price
        );

      await time.increase(duration * 2);

      await expect(market.connect(addr1).delistItem(itemId))
        .to.emit(market, "ItemDelisted")
        .withArgs(itemId, nft1.address, tokenId, addr1.address, price);

      expect(await nft1.ownerOf(tokenId)).to.equal(addr1.address);
    });

    it("Should fail to delist item", async function () {
      const { market, nft1, foundation, addr1, addr2 } = await loadFixture(
        deployFixture
      );
      const tokenId = 1;
      const itemId = 1;

      await expect(
        market
          .connect(addr1)
          .mintAndList(nft1.address, tokenURI, price, duration)
      )
        .to.emit(market, "ItemListed")
        .withArgs(
          itemId,
          nft1.address,
          tokenId,
          addr1.address,
          foundation.address,
          price
        );

      await time.increase(duration * 2);

      await expect(market.connect(addr2).delistItem(itemId)).to.revertedWith(
        "Only seller can delist item"
      );

      expect(await nft1.ownerOf(tokenId)).to.equal(market.address);
    });

    it("Should fail to delist item if item has been sold", async function () {
      const { market, nft1, foundation, addr1, addr2 } = await loadFixture(
        deployFixture
      );
      const tokenId = 1;
      const itemId = 1;

      await expect(
        market
          .connect(addr1)
          .mintAndList(nft1.address, tokenURI, price, duration)
      )
        .to.emit(market, "ItemListed")
        .withArgs(
          itemId,
          nft1.address,
          tokenId,
          addr1.address,
          foundation.address,
          price
        );

      await expect(market.connect(addr2).buyItem(itemId, { value: price }))
        .to.emit(market, "ItemSold")
        .withArgs(
          itemId,
          nft1.address,
          tokenId,
          addr1.address,
          addr2.address,
          foundation.address,
          price
        );

      await expect(market.connect(addr1).delistItem(itemId)).to.revertedWith(
        "Item already sold"
      );

      expect(await nft1.ownerOf(tokenId)).to.equal(addr2.address);
    });

    it("Should fail to delist item if auction has not expired", async function () {
      const { market, nft1, foundation, addr1, addr2 } = await loadFixture(
        deployFixture
      );
      const tokenId = 1;
      const itemId = 1;

      await expect(
        market
          .connect(addr1)
          .mintAndList(nft1.address, tokenURI, price, duration)
      )
        .to.emit(market, "ItemListed")
        .withArgs(
          itemId,
          nft1.address,
          tokenId,
          addr1.address,
          foundation.address,
          price
        );

      await expect(market.connect(addr1).delistItem(itemId)).to.revertedWith(
        "Item not available for delisting"
      );

      expect(await nft1.ownerOf(tokenId)).to.equal(market.address);
    });

    it("Should fail to delist item if item does not exist", async function () {
      const { market, addr1 } = await loadFixture(deployFixture);
      const itemId = 10;

      await expect(market.connect(addr1).delistItem(itemId)).to.revertedWith(
        "Only seller can delist item"
      );
    });

    it("Should relist item", async function () {
      const { market, nft1, foundation, addr1, addr2 } = await loadFixture(
        deployFixture
      );
      const tokenId = 1;
      const itemId = 1;
      const price2 = price.mul(2);

      await expect(
        market
          .connect(addr1)
          .mintAndList(nft1.address, tokenURI, price, duration)
      )
        .to.emit(market, "ItemListed")
        .withArgs(
          itemId,
          nft1.address,
          tokenId,
          addr1.address,
          foundation.address,
          price
        );

      await time.increase(duration * 2);

      await expect(market.connect(addr1).relistItem(itemId, price2, duration))
        .to.emit(market, "ItemRelisted")
        .withArgs(itemId, nft1.address, tokenId, addr1.address, price2);

      await expect(market.connect(addr2).buyItem(itemId, { value: price2 }))
        .to.emit(market, "ItemSold")
        .withArgs(
          itemId,
          nft1.address,
          tokenId,
          addr1.address,
          addr2.address,
          foundation.address,
          price2
        );

      expect(await nft1.ownerOf(tokenId)).to.equal(addr2.address);
    });

    it("Should relist item", async function () {
      const { market, nft1, foundation, addr1, addr2 } = await loadFixture(
        deployFixture
      );
      const tokenId = await mintNFT(nft1, addr1);
      const itemId = 1;
      const price2 = price.mul(2);

      await expect(
        market
          .connect(addr1)
          .listItemForSale(nft1.address, tokenId, price, duration)
      )
        .to.emit(market, "ItemListed")
        .withArgs(
          itemId,
          nft1.address,
          tokenId,
          addr1.address,
          foundation.address,
          price
        );

      await time.increase(duration * 2);

      await expect(market.connect(addr1).relistItem(itemId, price2, duration))
        .to.emit(market, "ItemRelisted")
        .withArgs(itemId, nft1.address, tokenId, addr1.address, price2);

      await expect(market.connect(addr2).buyItem(itemId, { value: price2 }))
        .to.emit(market, "ItemSold")
        .withArgs(
          itemId,
          nft1.address,
          tokenId,
          addr1.address,
          addr2.address,
          foundation.address,
          price2
        );

      expect(await nft1.ownerOf(tokenId)).to.equal(addr2.address);
    });

    it("Should fail to relist item", async function () {
      const { market, nft1, foundation, addr1, addr2 } = await loadFixture(
        deployFixture
      );
      const tokenId = 1;
      const itemId = 1;

      await expect(
        market
          .connect(addr1)
          .mintAndList(nft1.address, tokenURI, price, duration)
      )
        .to.emit(market, "ItemListed")
        .withArgs(
          itemId,
          nft1.address,
          tokenId,
          addr1.address,
          foundation.address,
          price
        );

      await time.increase(duration * 2);

      await expect(
        market.connect(addr2).relistItem(itemId, price, duration)
      ).to.revertedWith("Only seller can relist item");

      expect(await nft1.ownerOf(tokenId)).to.equal(market.address);
    });

    it("Should fail to relist item if item has been sold", async function () {
      const { market, nft1, foundation, addr1, addr2 } = await loadFixture(
        deployFixture
      );
      const tokenId = 1;
      const itemId = 1;

      await expect(
        market
          .connect(addr1)
          .mintAndList(nft1.address, tokenURI, price, duration)
      )
        .to.emit(market, "ItemListed")
        .withArgs(
          itemId,
          nft1.address,
          tokenId,
          addr1.address,
          foundation.address,
          price
        );

      await expect(market.connect(addr2).buyItem(itemId, { value: price }))
        .to.emit(market, "ItemSold")
        .withArgs(
          itemId,
          nft1.address,
          tokenId,
          addr1.address,
          addr2.address,
          foundation.address,
          price
        );

      await expect(
        market.connect(addr1).relistItem(itemId, price, duration)
      ).to.revertedWith("Item already sold");

      expect(await nft1.ownerOf(tokenId)).to.equal(addr2.address);
    });

    it("Should fail to relist item if auction has not expired", async function () {
      const { market, nft1, foundation, addr1, addr2 } = await loadFixture(
        deployFixture
      );
      const tokenId = 1;
      const itemId = 1;

      await expect(
        market
          .connect(addr1)
          .mintAndList(nft1.address, tokenURI, price, duration)
      )
        .to.emit(market, "ItemListed")
        .withArgs(
          itemId,
          nft1.address,
          tokenId,
          addr1.address,
          foundation.address,
          price
        );

      await expect(
        market.connect(addr1).relistItem(itemId, price, duration)
      ).to.revertedWith("Item not available for relisting");

      expect(await nft1.ownerOf(tokenId)).to.equal(market.address);
    });

    it("Should fail to relist item if duration is too short", async function () {
      const { market, nft1, foundation, addr1, addr2 } = await loadFixture(
        deployFixture
      );
      const tokenId = 1;
      const itemId = 1;

      await expect(
        market
          .connect(addr1)
          .mintAndList(nft1.address, tokenURI, price, duration)
      )
        .to.emit(market, "ItemListed")
        .withArgs(
          itemId,
          nft1.address,
          tokenId,
          addr1.address,
          foundation.address,
          price
        );

      await time.increase(duration * 2);

      await expect(
        market.connect(addr1).relistItem(itemId, price, 1)
      ).to.revertedWith("Listing should last more than 1 day");

      expect(await nft1.ownerOf(tokenId)).to.equal(market.address);
    });

    it("Should fail to relist item if item does not exist", async function () {
      const { market, addr1 } = await loadFixture(deployFixture);
      const itemId = 10;

      await expect(
        market.connect(addr1).relistItem(itemId, price, 1)
      ).to.revertedWith("Only seller can relist item");
    });
  });

  describe("Viewer", async function () {
    it("Should return all unsold market items", async function () {
      const { market, addr2 } = await loadFixture(viewerFixture);
      const res = await market.fetchItemsUnsold();
      expect(res.length).to.be.equal(1);
      expect(res[0].itemId).to.be.equal(1);
    });

    it("Should return all items except delisted items", async function () {
      const { market, addr2 } = await loadFixture(viewerFixture);
      const res = await market.fetchMarketItems();
      expect(res.length).to.be.equal(3);
      expect(res[0].itemId).to.be.equal(1);
      expect(res[1].itemId).to.be.equal(2);
      expect(res[2].itemId).to.be.equal(4);
    });

    it("Should return only items that a user has purchased", async function () {
      const { market, addr2 } = await loadFixture(viewerFixture);
      const res = await market.connect(addr2).fetchItemsBought();
      expect(res.length).to.be.equal(1);
      expect(res[0].itemId).to.be.equal(2);
    });

    it("Should return only items a user has created", async function () {
      const { market, nft1, addr1, addr2 } = await loadFixture(viewerFixture);

      const res1 = await market.connect(addr1).fetchItemsCreated();
      expect(res1.length).to.be.equal(2);
      expect(res1[0].itemId).to.be.equal(1);
      expect(res1[0].itemId).to.be.equal(1);

      const res2 = await market.connect(addr2).fetchItemsCreated();
      expect(res2.length).to.be.equal(1);
      expect(res2[0].itemId).to.be.equal(4);
    });
  });
});

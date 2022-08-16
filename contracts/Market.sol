// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

/*
 ________     ___    ___ ________  ________          ________  _________  ___  ___  ________  ___  ________     
|\   __  \   |\  \  /  /|\   __  \|\_____  \        |\   ____\|\___   ___\\  \|\  \|\   ___ \|\  \|\   __  \    
\ \  \|\  \  \ \  \/  / | \  \|\  \|____|\ /_       \ \  \___|\|___ \  \_\ \  \\\  \ \  \_|\ \ \  \ \  \|\  \   
 \ \   __  \  \ \    / / \ \   ____\    \|\  \       \ \_____  \   \ \  \ \ \  \\\  \ \  \ \\ \ \  \ \  \\\  \  
  \ \  \ \  \  /     \/   \ \  \___|   __\_\  \       \|____|\  \   \ \  \ \ \  \\\  \ \  \_\\ \ \  \ \  \\\  \ 
   \ \__\ \__\/  /\   \    \ \__\     |\_______\        ____\_\  \   \ \__\ \ \_______\ \_______\ \__\ \_______\
    \|__|\|__/__/ /\ __\    \|__|     \|_______|       |\_________\   \|__|  \|_______|\|_______|\|__|\|_______|
             |__|/ \|__|                               \|_________|                                             

*/

import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./NFT.sol";

import "hardhat/console.sol";

contract NFTMarket is ReentrancyGuard, Ownable {
    using Counters for Counters.Counter;
    using SafeMath for uint256;
    Counters.Counter private _itemIds;

    uint256 public feeRate = 10;

    constructor() {}

    struct MarketItem {
        uint256 itemId;
        address nftContract;
        uint256 tokenId;
        address payable seller;
        address payable owner;
        uint256 expiration;
        uint256 price;
        bool sold;
    }

    mapping(uint256 => MarketItem) private MarketItems;

    event ItemListed(
        uint256 indexed itemId,
        address indexed nftContract,
        uint256 indexed tokenId,
        address seller,
        address organisation,
        uint256 price
    );

    event ItemDelisted(
        uint256 indexed itemId,
        address indexed nftContract,
        uint256 indexed tokenId,
        address seller,
        uint256 price
    );

    event ItemRelisted(
        uint256 indexed itemId,
        address indexed nftContract,
        uint256 indexed tokenId,
        address seller,
        uint256 price
    );

    event ItemSold(
        uint256 indexed itemId,
        address indexed nftContract,
        uint256 indexed tokenId,
        address seller,
        address owner,
        address organisation,
        uint256 price
    );

    function updateFeeRate(uint256 newRate) public onlyOwner {
        require(newRate <= 10, "Fee rate should be lower than 10");
        feeRate = newRate;
    }

    function listItem(
        address nftContract,
        uint256 tokenId,
        uint256 price,
        uint256 duration
    ) internal returns (uint256) {
        _itemIds.increment();
        uint256 itemId = _itemIds.current();
        uint256 expiration = block.timestamp + duration;

        MarketItems[itemId] = MarketItem(
            itemId,
            nftContract,
            tokenId,
            payable(msg.sender),
            payable(address(0)),
            expiration,
            price,
            false
        );

        return (itemId);
    }

    /* Places an item for sale on the marketplace */
    function listItemForSale(
        address nftContract,
        uint256 tokenId,
        uint256 price,
        uint256 duration
    ) public nonReentrant {
        require(duration >= 86400, "Listing should last more than 1 day");

        address organisation = Ownable(nftContract).owner();
        uint256 itemId = listItem(nftContract, tokenId, price, duration);

        IERC721(nftContract).transferFrom(msg.sender, address(this), tokenId);

        emit ItemListed(
            itemId,
            nftContract,
            tokenId,
            msg.sender,
            organisation,
            price
        );
    }

    function mintAndList(
        address nftContract,
        string memory tokenURI,
        uint256 price,
        uint256 duration
    ) public nonReentrant {
        require(duration >= 86400, "Listing should last more than 1 day");

        address organisation = Ownable(nftContract).owner();
        uint256 tokenId = NFT(nftContract).createToken(tokenURI);
        uint256 itemId = listItem(nftContract, tokenId, price, duration);

        emit ItemListed(
            itemId,
            nftContract,
            tokenId,
            msg.sender,
            organisation,
            price
        );
    }

    /* Creates the sale of a marketplace item */
    /* Transfers ownership of the item, as well as funds between parties */
    function buyItem(uint256 itemId) public payable nonReentrant {
        uint256 price = MarketItems[itemId].price;

        require(
            msg.value == price,
            "Please submit the asking price in order to complete the purchase"
        );
        require(MarketItems[itemId].itemId == itemId, "Item does not exist");
        require(!MarketItems[itemId].sold, "Item already sold");
        require(
            MarketItems[itemId].expiration > block.timestamp,
            "Item not available for sale"
        );

        uint256 tokenId = MarketItems[itemId].tokenId;
        address nftContract = MarketItems[itemId].nftContract;
        address seller = MarketItems[itemId].seller;
        uint256 fees = msg.value.mul(feeRate).div(100);
        address organisation = Ownable(nftContract).owner();

        MarketItems[itemId].sold = true;
        MarketItems[itemId].owner = payable(msg.sender);
        payable(owner()).transfer(fees);
        payable(organisation).transfer(msg.value.sub(fees));
        IERC721(nftContract).transferFrom(address(this), msg.sender, tokenId);

        emit ItemSold(
            itemId,
            nftContract,
            tokenId,
            seller,
            msg.sender,
            organisation,
            price
        );
    }

    function relistItem(
        uint256 itemId,
        uint256 price,
        uint256 duration
    ) public nonReentrant {
        address seller = MarketItems[itemId].seller;

        require(msg.sender == seller, "Only seller can relist item");
        require(!MarketItems[itemId].sold, "Item already sold");
        require(
            (MarketItems[itemId].expiration + 300) < block.timestamp,
            "Item not available for relisting"
        );
        require(duration >= 86400, "Listing should last more than 1 day");

        address nftContract = MarketItems[itemId].nftContract;
        uint256 tokenId = MarketItems[itemId].tokenId;
        uint256 expiration = block.timestamp + duration;

        MarketItems[itemId].expiration = expiration;
        MarketItems[itemId].price = price;

        emit ItemRelisted(itemId, nftContract, tokenId, seller, price);
    }

    function delistItem(uint256 itemId) public nonReentrant {
        address seller = MarketItems[itemId].seller;

        require(msg.sender == seller, "Only seller can delist item");
        require(!MarketItems[itemId].sold, "Item already sold");
        require(
            (MarketItems[itemId].expiration + 300) < block.timestamp,
            "Item not available for delisting"
        );

        address nftContract = MarketItems[itemId].nftContract;
        uint256 tokenId = MarketItems[itemId].tokenId;

        MarketItems[itemId].nftContract = address(0);
        MarketItems[itemId].seller = payable(address(0));
        MarketItems[itemId].sold = true;
        IERC721(nftContract).transferFrom(address(this), msg.sender, tokenId);

        emit ItemDelisted(
            itemId,
            nftContract,
            tokenId,
            seller,
            MarketItems[itemId].price
        );
    }

    /* Returns all unsold market items */
    function fetchItemsUnsold() public view returns (MarketItem[] memory) {
        uint256 totalItemCount = _itemIds.current();
        uint256 itemCount = 0;
        uint256 currentIndex = 0;

        for (uint256 i = 0; i < totalItemCount; i++) {
            if (
                !MarketItems[i + 1].sold &&
                MarketItems[i + 1].seller != address(0) &&
                MarketItems[i + 1].expiration > block.timestamp
            ) {
                itemCount += 1;
            }
        }

        MarketItem[] memory items = new MarketItem[](itemCount);
        for (uint256 i = 0; i < totalItemCount; i++) {
            if (
                !MarketItems[i + 1].sold &&
                MarketItems[i + 1].seller != address(0) &&
                MarketItems[i + 1].expiration > block.timestamp
            ) {
                uint256 currentId = i + 1;
                MarketItem storage currentItem = MarketItems[currentId];
                items[currentIndex] = currentItem;
                currentIndex += 1;
            }
        }
        return items;
    }

    /* Returns all items except delisted items */
    function fetchMarketItems() public view returns (MarketItem[] memory) {
        uint256 totalItemCount = _itemIds.current();
        uint256 itemCount = 0;
        uint256 currentIndex = 0;

        for (uint256 i = 0; i < totalItemCount; i++) {
            if (MarketItems[i + 1].seller != address(0)) {
                itemCount += 1;
            }
        }

        MarketItem[] memory items = new MarketItem[](itemCount);
        for (uint256 i = 0; i < totalItemCount; i++) {
            if (MarketItems[i + 1].seller != address(0)) {
                uint256 currentId = i + 1;
                MarketItem storage currentItem = MarketItems[currentId];
                items[currentIndex] = currentItem;
                currentIndex += 1;
            }
        }
        return items;
    }

    /* Returns only items that a user has purchased */
    function fetchItemsBought() public view returns (MarketItem[] memory) {
        uint256 totalItemCount = _itemIds.current();
        uint256 itemCount = 0;
        uint256 currentIndex = 0;

        for (uint256 i = 0; i < totalItemCount; i++) {
            if (MarketItems[i + 1].owner == msg.sender) {
                itemCount += 1;
            }
        }

        MarketItem[] memory items = new MarketItem[](itemCount);
        for (uint256 i = 0; i < totalItemCount; i++) {
            if (MarketItems[i + 1].owner == msg.sender) {
                uint256 currentId = i + 1;
                MarketItem storage currentItem = MarketItems[currentId];
                items[currentIndex] = currentItem;
                currentIndex += 1;
            }
        }
        return items;
    }

    /* Returns only items a user has created */
    function fetchItemsCreated() public view returns (MarketItem[] memory) {
        uint256 totalItemCount = _itemIds.current();
        uint256 itemCount = 0;
        uint256 currentIndex = 0;

        for (uint256 i = 0; i < totalItemCount; i++) {
            if (MarketItems[i + 1].seller == msg.sender) {
                itemCount += 1;
            }
        }

        MarketItem[] memory items = new MarketItem[](itemCount);
        for (uint256 i = 0; i < totalItemCount; i++) {
            if (MarketItems[i + 1].seller == msg.sender) {
                uint256 currentId = i + 1;
                MarketItem storage currentItem = MarketItems[currentId];
                items[currentIndex] = currentItem;
                currentIndex += 1;
            }
        }
        return items;
    }
}
